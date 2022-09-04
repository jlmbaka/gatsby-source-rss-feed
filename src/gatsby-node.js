import crypto from "crypto"
import Parser from "rss-parser"
import omitBy from "lodash/omitBy"
import { createRemoteFileNode } from "gatsby-source-filesystem"

const normalize = item => {
  const namespaceMatched = Object.keys(item).filter(e => e.match(/:/))
  if (namespaceMatched.length === 0) {
    return item
  }

  let namespaced = {}
  namespaceMatched.forEach(key => {
    const [namespace, childKey] = key.split(":")
    if (!namespaced[namespace]) {
      namespaced[namespace] = {}
    }
    namespaced[namespace][childKey] = item[key]
  })

  return {
    ...omitBy(item, (_, key) => key.match(/:/)),
    ...namespaced,
  }
}

const renameSymbolMap = {
  _: "text",
  $: "attrs",
}

const renameSymbolKeys = obj => {
  Object.keys(obj).forEach(key => {
    if (typeof obj[key] === "object") {
      renameSymbolKeys(obj[key])
    }
    if (renameSymbolMap[key]) {
      obj[renameSymbolMap[key]] = obj[key]
      delete obj[key]
    }
  })
}

const createContentDigest = obj =>
  crypto.createHash(`md5`).update(JSON.stringify(obj)).digest(`hex`)

exports.sourceNodes = async (
  { actions, createNodeId },
  { url, name, parserOption = {} }
) => {
  if (!url) {
    throw new Error("url is required.")
  }

  if (!name) {
    throw new Error("name is required.")
  }

  const { createNode } = actions

  const parser = new Parser(parserOption)
  const feed = await parser.parseURL(url)
  const { items, ...other } = feed

  items.forEach(async item => {
    const nodeId = createNodeId(item.guid || item.link)
    const normalizedItem = normalize(item)
    renameSymbolKeys(normalizedItem)

    // Create Node
    createNode({
      ...normalizedItem,
      id: nodeId,
      parent: null,
      children: [],
      internal: {
        contentDigest: createContentDigest(item),
        type: `Feed${name}`,
      },
    })
  })

  const meta = {}
  Object.keys(other).forEach(key => (meta[key] = feed[key]))
  createNode({
    id: createNodeId(`Feed${name}`),
    ...meta,
    parent: null,
    children: [],
    internal: {
      contentDigest: createContentDigest(feed.title),
      type: `Feed${name}Meta`,
    },
  })
}

// called each time a node is created
exports.onCreateNode = async ({
  node, // the node that was just created
  actions: { createNode, createNodeField },
  createNodeId,
  getCache,
}) => {
  if (node.internal.type === "FeedGoodreadsBook") {
    const fileNode = await createRemoteFileNode({
      // the url of the remote image to generate a node for
      url: node.coverImageUrl,
      parentNodeId: node.id,
      createNode,
      createNodeId,
      getCache,
    })
    if (fileNode) {
      createNodeField({ node, name: "coverImage", value: fileNode.id })
    }
  }
}

exports.createSchemaCustomization = ({ actions }) => {
  const { createTypes } = actions
  createTypes(`
    type FeedGoodreadsBook implements Node {
      coverImage: File @link(from: "fields.coverImage")
    }
  `)
}
