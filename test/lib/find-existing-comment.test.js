const findExistingComment = require('../../lib/find-existing-comment')

describe('findExistingComment', () => {
  let context

  beforeEach(() => {
    context = {
      issue: o => ({ owner: 'primer', repo: 'basecoat', number: 1, ...o }),
      github: { issues: { listComments: jest.fn() } }
    }
  })

  it('returns the comment', async () => {
    const comments = [
      { user: { type: 'User' }, body: 'Test' },
      { user: { type: 'Bot' }, body: '<!-- FIGMA DIFF PROBOT --> Magic!' }
    ]
    context.github.issues.listComments.mockReturnValueOnce(Promise.resolve({ data: comments }))
    const actual = await findExistingComment(context)
    expect(actual).toEqual(comments[1])
  })

  it('returns `undefined` if the comment does not exist', async () => {
    context.github.issues.listComments.mockReturnValueOnce(Promise.resolve({ data: [] }))
    const actual = await findExistingComment(context)
    expect(actual).toBe(undefined)
  })
})
