module.exports = robot => {
  // Will trigger whenever a new PR is opened or pushed to
  robot.on(['pull_request.opened', 'pull_request.synchronize'], async context => {
    // Get the diff of the PR
    const diff = (await context.github.pullRequests.get(context.issue({
      headers: { Accept: 'application/vnd.github.diff' }
    }))).data

    const oldReg = /-.+"url":\s?"https:\/\/www\.figma\.com\/file\/(.+)\/(.+)"/
    const newReg = /\+.+"url":\s?"https:\/\/www\.figma\.com\/file\/(.+)\/(.+)"/

    const oldMatch = oldReg.exec(diff)
    const newMatch = newReg.exec(diff)

    if (oldMatch && newMatch) {
      const oldCode = oldMatch[1]
      const oldTitle = oldMatch[2]

      const newCode = newMatch[1]
      const newTitle = newMatch[2]

      console.log({ oldCode, oldTitle, newCode, newTitle })

      // 1. Ask the Figma API for exports of old and new codes

      // 2. Run pixelmatch, generate an image
      // 2.1 Upload it somewhere to have a link for a GitHub comment

      // 3. Comment on the PR with the diff image
    }
  })
}
