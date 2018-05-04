const got = require('got')

const getFigmaComponents = (figmaFileKey) => {
  return new Promise((resolve, reject) => {
    got.get(`https://api.figma.com/v1/files/${figmaFileKey}`, {
      headers: { 'Content-Type': 'application/json', 'x-figma-token': process.env.FIGMA_TOKEN },
      json: true
    })
    .then(response => {
      let components = {}
      const check = (c) => {
        if (c.type === 'COMPONENT') {
          components[c.id] = {
            name: c.name,
            id: c.id,
            description: response.body.components[c.id].description,
            raw: JSON.stringify(c)
          }
        } else if (c.children) {
          c.children.forEach(check)
        }
      }
      response.body.document.children.forEach(check)
      return resolve(components)
    })
    .catch(err => {
      reject(err)
    })
  })
}

const getFigmaImages = (figmaFileKey, componentIds, aws=true) => {
  return new Promise((resolve, reject) => {
    got.get(`https://api.figma.com/v1/images/${figmaFileKey}`, {
      query: {
        ids: componentIds,
        format: 'svg'
      },
      headers: { 'Content-Type': 'application/json', 'x-figma-token': process.env.FIGMA_TOKEN },
      json: true
    })
    .then(response => {
      if (response.body.err) {
        reject(response.body.err)
      } else {
        return (response.body.images)
      }
    })
    .then(images => {
      if (aws) {
        resolve(
          Promise.all(Object.keys(images).map(k => {
            const url = images[k]
            return got.get(url, {
              headers: { 'Content-Type': 'images/svg+xml' }
            }).then(response => {
              return {
                'url': url,
                'id': k,
                'raw': response.body
              }
            })
          }))
        )
      } else {
        resolve(images)
      }
    })
    .catch(err => reject(err))
  })
}

const hasChanged = (before, after) => {
  if (before.name !== after.name ||
     before.description !== after.description ||
     before.raw !== after.raw ||
     before.image.raw !== after.image.raw) {
    return true
  }
  return false
}

const getFigmaFileId = (str) => {
  return /www\.figma\.com\/file\/(.+)\//.exec(str).pop()
}

const octiconsBeforeAfter = async (diff, context) => {

  let data = {}

  diff.match(/^[-+]\s.*www\.figma\.com\/file\/.+\//gm).forEach(m => {
    data[m[0] === '-' ? 'before' : 'after'] = {
      'fileId': getFigmaFileId(m)
    }
  })

  if (data.before.fileId && data.after.fileId) {
    // Get Before components
    data.before.components = (await getFigmaComponents(data.before.fileId))

    // Get After components
    data.after.components = (await getFigmaComponents(data.after.fileId))

    // Get Before images
    let bimages = (await getFigmaImages(data.before.fileId, Object.keys(data.before.components).join(',')))

    bimages.forEach(bi => {
      data.before.components[bi.id].image = bi
    })

    // Get After images
    let aimages = (await getFigmaImages(data.after.fileId, Object.keys(data.after.components).join(',')))

    aimages.forEach(ai => {
      data.after.components[ai.id].image = ai
    })

    // Mark any that changed on the surface (no <path> data in first call)
    Object.keys(data.before.components).forEach((k) => {
      if (!hasChanged(data.before.components[k], data.after.components[k])) {
        delete data.before.components[k]
        delete data.after.components[k]
      }
    })

    // Exit early if no components have changed
    if (Object.keys(data.before.components).length === 0 ||
    Object.keys(data.after.components).length === 0) return

    return `
    | Before | After |
    | :-- | :-- |
    ${Object.values(data.before.components).map((b) => {
      const a = data.after.components[b.id]
      return `| **Name:** \`${b.name}\`<br>**Description:** \`${b.description}\`  [<img src="${b.image.url}" height="200"/>](${b.image.url}) | **Name:** \`${a.name}\`<br>**Description:** \`${a.description}\`  [<img src="${a.image.url}" height="200"/>](${a.image.url}) |`
    }).join('\n')}`
  }
}

const primerComponentChanges = async (diff, context) => {

  let modules = diff.match(/^diff --git a\/([\w\/\-]*).scss/gm).map(line => {

    const file = /^diff --git a\/([\w\/\-]*).scss/.exec(line).pop().split("/")
    return {
      name: file[1],
      path: `${file.slice(0,2).join("/")}/package.json`,
      components: []
    }
  })
  // If a scss file was changed
  modules = (await modules.map(async m => {

    // Getting module package.json from github and parsing as JSON
    const pkg = JSON.parse(Buffer.from((await context.github.repos.getContent(context.repo({
      path: m.path,
      ref: context.payload.pull_request.head.ref,
      repo: context.payload.repository.name,
      owner: context.payload.repository.owner.login
    }))).data.content, 'base64').toString())

    m.url = pkg.figma.url

    const components = Object.values(pkg.figma.components).map(m => m.id).join(",")
    const fileId = getFigmaFileId(pkg.figma.url)

    let images = (await getFigmaImages(fileId, components, false))
    Object.keys(images).map(i => {
      m.components.push({
        id: i,
        url: images[i],
        name: Object.keys(pkg.figma.components).find(k => pkg.figma.components[k].id == i)
      })
    })
    m.components.sort((a, b) => b.name - a.name)
    return m
  }))
  return Promise.all(modules)
    .then(modules => {
      const componentsTemplate = (module) => {
        return module.components.map(i => {
          return `* \`${i.name}\` – 🔗[figma file](${module.url}?node-id=${encodeURIComponent(i.id)})

    [![](${i.url})](${module.url}?node-id=${encodeURIComponent(i.id)})`
        }).join("\n")
      }

      return `@${context.payload.pull_request.user.login} This pull request changes the \`${modules.map(m => m.name).join(", ")}\` module${(modules.length > 1 ? 's' : '')}. Here are a list of what the components currently look like in figma.

${modules.map(module => {
  return `#### ${module.name}\n${componentsTemplate(module)}`
}).join("\n")}`
    })
}

module.exports = robot => {

  // Will trigger whenever a new PR is opened or pushed to
  robot.on(['pull_request.opened', 'pull_request.synchronize'], async context => {
    let message = ""
    // Get the diff of the PR
    const diff = (await context.github.pullRequests.get(context.issue({
      headers: { Accept: 'application/vnd.github.diff' }
    }))).data

    switch (context.payload.repository.full_name) {
      case "primer/octicons":
        message = (await octiconsBeforeAfter(diff, context))
        break;
      case "primer/primer":
        message = (await primerComponentChanges(diff, context))
        break;
      default:
    }

    // Determine if there is already a comment on this PR from ci-reporter
    const comments = await context.github.issues.getComments(context.issue({ number: context.payload.pull_request.number }))
    const comment = comments.data.find(comment => comment.user.login === 'figma-diff[bot]')

    // If there is, edit that one
    if (comment) {
      const params = context.issue({id: comment.id, body: message})
      return context.github.issues.editComment(params)
    } else {
      const params = context.issue({body: message})
      return context.github.issues.createComment(params)
    }

  })
}
