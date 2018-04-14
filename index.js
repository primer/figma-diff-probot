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

const getFigmaImages = (figmaFileKey, componentIds) => {
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

// Template
const changeComment = (data) => {
  return `
| Before | After |
| :-- | :-- |
${Object.values(data.before.components).map((b) => {
  const a = data.after.components[b.id]
  return `| **Name:** \`${b.name}\`<br>**Description:** \`${b.description}\`  [<img src="${b.image.url}" height="200"/>](${b.image.url}) | **Name:** \`${a.name}\`<br>**Description:** \`${a.description}\`  [<img src="${a.image.url}" height="200"/>](${a.image.url}) |`
}).join('\n')}`
}

module.exports = robot => {
  // Will trigger whenever a new PR is opened or pushed to
  robot.on(['pull_request.opened', 'pull_request.synchronize'], async context => {
    // Get the diff of the PR
    const diff = (await context.github.pullRequests.get(context.issue({
      headers: { Accept: 'application/vnd.github.diff' }
    }))).data

    let data = {}

    diff.match(/^[-+]\s.*www\.figma\.com\/file\/.+\//gm).forEach(m => {
      data[m[0] === '-' ? 'before' : 'after'] = {
        'fileId': /www\.figma\.com\/file\/(.+)\//.exec(m).pop()
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

      const params = context.issue({body: changeComment(data)})

      return context.github.issues.createComment(params)
    }
  })
}
