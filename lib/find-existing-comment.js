/**
 * Returns the existing comment created by this app if it exists
 */
module.exports = async function findExistingComment (context) {
  const comments = await context.github.issues.listComments(context.issue({ per_page: 100 }))
  return comments.data.find(comment => {
    return comment.user.type === 'Bot' && comment.body.startsWith('<!-- FIGMA DIFF PROBOT -->')
  })
}
