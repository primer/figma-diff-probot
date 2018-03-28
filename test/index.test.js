const {createRobot} = require('probot')
const fs = require('fs')
const path = require('path')
const figmadiffer = require('../')

describe('figmadiffer', () => {
  let robot, github, event
  const diff = fs.readFileSync(path.join(__dirname, 'fixtures', 'diff.txt'), 'utf8')

  beforeEach(() => {
    robot = createRobot()
    github = {
      pullRequests: {
        get: jest.fn(() => Promise.resolve({ data: diff }))
      }
    }
    robot.auth = () => Promise.resolve(github)

    event = {
      event: 'pull_request',
      payload: {
        action: 'opened',
        repository: {
          owner: 'primer',
          name: 'octicons'
        },
        issue: {
          number: 1
        },
        installation: { id: 1 }
      }
    }

    figmadiffer(robot)
  })

  it('logs things', async () => {
    await robot.receive(event)
  })
})
