const {createRobot} = require('probot')
const fs = require('fs')
const path = require('path')
const nock = require('nock')
const app = require('../')

// Fixtures
const diff = fs.readFileSync(path.join(__dirname, 'fixtures', 'diff.txt'), 'utf8')

const beforeFile = require('./fixtures/beforeFile.json')
const afterFile = require('./fixtures/afterFile.json')

const beforeImages = require('./fixtures/beforeImages.json')
const afterImages = require('./fixtures/afterImages.json')

// Keys (mock Figma document keys)
const BEFORE_KEY = 'BEFORE_KEY'
const AFTER_KEY = 'AFTER_KEY'

describe('figma-diff-probot', () => {
  let robot, github, event

  beforeEach(() => {
    robot = createRobot()
    github = {
      pullRequests: {
        get: jest.fn(() => Promise.resolve({ data: diff }))
      },
      issues: {
        createComment: jest.fn(),
        listComments: jest.fn(() => Promise.resolve({ data: [] })),
        editComment: jest.fn()
      }
    }

    robot.auth = () => Promise.resolve(github)

    event = {
      event: 'pull_request',
      payload: {
        action: 'opened',
        repository: {
          owner: { name: 'primer' },
          name: 'octicons'
        },
        issue: {
          number: 1
        },
        installation: { id: 1 }
      }
    }

    // Mock the Figma API
    nock('https://api.figma.com/v1')
      .get(`/files/${BEFORE_KEY}`).reply(200, beforeFile)
      .get(`/files/${AFTER_KEY}`).reply(200, afterFile)
      .get(`/images/${BEFORE_KEY}`).query({ ids: '0:400', format: 'svg' }).reply(200, beforeImages)
      .get(`/images/${AFTER_KEY}`).query({ ids: '0:400', format: 'svg' }).reply(200, afterImages)

    // Mock the endpoint that Figma uses for images
    nock('https://images.com')
      .get('/before').reply(200, '<svg>BEFORE</svg>')
      .get('/after').reply(200, '<svg>AFTER</svg>')

    app(robot)
  })

  it('creates a comment with a before and after image', async () => {
    await robot.receive(event)

    expect(github.issues.createComment).toHaveBeenCalled()
    expect(github.issues.createComment.mock.calls).toMatchSnapshot()
  })

  it('updates the existing comment', async () => {
    github.issues.listComments.mockReturnValueOnce(Promise.resolve({ data: [
      { user: { type: 'Bot' }, body: '<!-- FIGMA DIFF PROBOT --> Hi!' }
    ] }))
    await robot.receive(event)

    expect(github.issues.createComment).not.toHaveBeenCalled()
    expect(github.issues.editComment).toHaveBeenCalled()
    expect(github.issues.editComment.mock.calls).toMatchSnapshot()
  })

  it('does not create a comment if there are no differences', async () => {
    nock.cleanAll()
    nock('https://api.figma.com/v1')
      .get(`/files/${BEFORE_KEY}`).reply(200, beforeFile)
      .get(`/files/${AFTER_KEY}`).reply(200, beforeFile)
      .get(`/images/${BEFORE_KEY}`).query({ ids: '0:400', format: 'svg' }).reply(200, beforeImages)
      .get(`/images/${AFTER_KEY}`).query({ ids: '0:400', format: 'svg' }).reply(200, afterImages)

    nock('https://images.com')
      .get('/before').reply(200, '<svg>BEFORE</svg>')
      .get('/after').reply(200, '<svg>BEFORE</svg>')

    await robot.receive(event)

    expect(github.issues.createComment).not.toHaveBeenCalled()
  })
})
