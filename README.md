# Figma Image Diff probot

> a GitHub App built with [probot](https://github.com/probot/probot) that checks before and after components between two Figma files and posts before after images.

![image](https://user-images.githubusercontent.com/54012/38582457-a76db572-3cc4-11e8-8b95-34345c8beab8.png)

## Usage

This probot is customized to work with [Octicons](https://github.com/primer/octicons) to look for changes in the figma import url found in the octicons package.json.

When there is a change in the url, this bot will pull down images for the before and after files and generate a before and after image for any changed components.

## Documentation

The documentation for writing your own Probot can be [found on the probot website](https://probot.github.io/).

## License

[MIT](./LICENSE) &copy; [GitHub](https://github.com/)
