import { INode, INodeData, INodeOutputsValue, INodeParams } from '../../../src/Interface'
import { OpenSearchVectorStore } from 'langchain/vectorstores/opensearch'
import { Embeddings } from 'langchain/embeddings/base'
import { Client } from '@opensearch-project/opensearch'
import { handleEscapeCharacters, getBaseClasses } from '../../../src/utils'

class OpenSearch_Existing_VectorStores implements INode {
    label: string
    name: string
    version: number
    description: string
    type: string
    icon: string
    category: string
    baseClasses: string[]
    inputs: INodeParams[]
    outputs: INodeOutputsValue[]

    constructor() {
        this.label = 'OpenSearch Load Existing Index - V2'
        this.name = 'openSearchExistingIndex-v2'
        this.version = 1.0
        this.type = 'OpenSearch'
        this.icon = 'opensearch.png'
        this.category = 'Vector Stores'
        this.description = 'Load existing index from OpenSearch (i.e: Document has been upserted)'
        this.baseClasses = [this.type, 'VectorStoreRetriever', 'BaseRetriever']
        this.inputs = [
            {
                label: 'Embeddings',
                name: 'embeddings',
                type: 'Embeddings'
            },
            {
                label: 'OpenSearch URL (without https/http)',
                name: 'opensearchURL',
                type: 'string',
                placeholder: '127.0.0.1'
            },
            {
                label: 'OpenSearch Username',
                name: 'opensearchUsername',
                type: 'string',
                placeholder: 'admin'
            },
            {
                label: 'OpenSearch Password',
                name: 'opensearchPassword',
                type: 'string',
                placeholder: 'admin'
            },
            {
                label: 'Index Name',
                name: 'indexName',
                type: 'string'
            },
            {
                label: 'Top K',
                name: 'topK',
                description: 'Number of top results to fetch. Default to 4',
                placeholder: '4',
                type: 'number',
                additionalParams: true,
                optional: true
            },
            {
                label: 'Minimum Score (%)',
                name: 'minScore',
                type: 'number',
                optional: true,
                placeholder: '75',
                step: 1,
                description: 'Minumum score for embeddings documents to be included'
            },
            {
                label: 'OpenSearch Metadata Filter',
                name: 'values',
                type: 'json',
                optional: true,
                acceptVariable: true,
                list: true
            }
        ]
        this.outputs = [
            {
                label: 'OpenSearch Retriever',
                name: 'retriever',
                baseClasses: this.baseClasses
            },
            {
                label: 'OpenSearch Vector Store',
                name: 'vectorStore',
                baseClasses: [this.type, ...getBaseClasses(OpenSearchVectorStore)]
            },
            {
                label: 'Document',
                name: 'document',
                baseClasses: this.baseClasses
            },
            {
                label: 'Text',
                name: 'text',
                baseClasses: ['string', 'json']
            }
        ]
    }

    async init(nodeData: INodeData): Promise<any> {
        const embeddings = nodeData.inputs?.embeddings as Embeddings
        const minScore = nodeData.inputs?.minScore as number
        const values = nodeData.inputs?.values
        const opensearchURL = nodeData.inputs?.opensearchURL as string
        const opensearchUsername = nodeData.inputs?.opensearchUsername as string
        const opensearchPassword = nodeData.inputs?.opensearchPassword as string
        const indexName = nodeData.inputs?.indexName as string
        const output = nodeData.outputs?.output as string
        const topK = nodeData.inputs?.topK as string
        const k = topK ? parseFloat(topK) : 4

        let nodeValues = JSON.parse(values)

        for (const property in nodeValues) {
            nodeValues[property] = nodeValues[property].replaceAll('FLOWISENEWLINE', '')
            nodeValues[property] = nodeValues[property].replaceAll('FLOWISEDOUBLEQUOTE', '"')
            if (property === 'query' || property === 'filter') {
                nodeValues[property] = JSON.parse(nodeValues[property])
            }
        }

        const client = new Client({
            nodes: ['https://' + opensearchUsername + ':' + opensearchPassword + '@' + opensearchURL]
        })

        // const vectorStore = new OpenSearchVectorStore(embeddings, {
        //     client,
        //     indexName
        // })

        const vectorStore = await OpenSearchVectorStore.fromExistingIndex(embeddings, {
            client,
            indexName
        })

        const docs = await vectorStore.similaritySearchWithScore(nodeValues.question, k)

        // eslint-disable-next-line no-console
        console.log('\x1b[94m\x1b[1m\n*****VectorStore Documents*****\n\x1b[0m\x1b[0m')
        // eslint-disable-next-line no-console
        console.log(docs)

        if (output === 'document') {
            let finaldocs = []
            for (const doc of docs) {
                if (minScore && doc[1] < minScore / 100) continue
                finaldocs.push(doc[0])
            }
            return finaldocs.toString()
        } else {
            let finaltext = ''
            for (const doc of docs) {
                if (minScore && doc[1] < minScore / 100) continue
                finaltext += `${doc[0].metadata.text}\n`
            }
            return handleEscapeCharacters(finaltext, false)
        }
    }
}

module.exports = { nodeClass: OpenSearch_Existing_VectorStores }
