import { ICommonObject, INode, INodeData, INodeParams, INodeOutputsValue } from '../../../src/Interface'
import { TextSplitter } from 'langchain/text_splitter'
import { BaseDocumentLoader } from 'langchain/document_loaders/base'
import { Block, Inline, Node, helpers } from '@contentful/rich-text-types'
import { Document } from 'langchain/document'
import * as contentful from 'contentful'
import { getCredentialData, getCredentialParam } from '../../../src/utils'

interface ContentTypeConfig {
    contentType: string
    fieldsToParse: string[]
}

interface FieldsForCitation {
    titleField: string
    slugField: string
    urlPrefix: string
}

interface RichTextParsingRules {
    'embedded-asset-block': boolean
    'embedded-entry-block': boolean
    'embedded-entry-inline': boolean
}

interface ContentfulConfig {
    mainContentType: ContentTypeConfig
    embeddedContentTypes: ContentTypeConfig[]
    richTextParsingRules: RichTextParsingRules
    fieldsForCitation: FieldsForCitation
}

export function documentToPlainTextString(
    rootNode: Block | Inline,
    blockDivisor: string = ' ',
    parsingRules: any = {},
    processContentObjectMethod: (contentObject: IContentObject, contentTypeConfig: ContentTypeConfig) => string
): string {
    if (!rootNode || !rootNode.content || !Array.isArray(rootNode.content)) {
        console.warn('Invalid rootNode:', rootNode)
        return ''
    }

    return (rootNode as Block).content.reduce((acc: string, node: Node, i: number): string => {
        let nodeTextValue: string = ''

        if (node.nodeType in parsingRules && parsingRules[node.nodeType] === false) {
            return acc
        }

        if (helpers.isText(node)) {
            nodeTextValue = node.value
        } else if (helpers.isBlock(node) || helpers.isInline(node)) {
            if (node.nodeType === 'embedded-asset-block') {
                nodeTextValue = `![${node.data.target.fields.title}](https:${node.data.target.fields.file.url})`
            } else if (node.nodeType === 'embedded-entry-block' || node.nodeType === 'embedded-entry-inline') {
                const embeddedContentObject = node.data.target
                if (!embeddedContentObject || !embeddedContentObject.sys) {
                    console.warn('Invalid embeddedContentObject or sys property missing:', node)
                    return acc
                }

                const embeddedContentType = embeddedContentObject?.sys?.contentType?.sys?.id
                const embeddedConfig = parsingRules.embeddedContentTypes?.find(
                    (config: ContentfulConfig) => config.mainContentType.contentType === embeddedContentType
                )

                if (embeddedConfig) {
                    try {
                        nodeTextValue = processContentObjectMethod(embeddedContentObject, embeddedConfig)
                    } catch (error) {
                        console.error('Error processing embedded content object:', error, embeddedContentObject)
                    }
                } else {
                    try {
                        nodeTextValue = documentToPlainTextString(node, blockDivisor, parsingRules, processContentObjectMethod)
                    } catch (error) {
                        console.error('Error processing node:', error, node)
                    }
                }
            } else {
                try {
                    nodeTextValue = documentToPlainTextString(node, blockDivisor, parsingRules, processContentObjectMethod)
                } catch (error) {
                    console.error('Error processing node:', error, node)
                }
            }
            if (!nodeTextValue.length) {
                return acc
            }
        }

        const nextNode = rootNode.content[i + 1]
        const isNextNodeBlock = nextNode && helpers.isBlock(nextNode)
        const divisor = isNextNodeBlock ? blockDivisor : ''
        return acc + nodeTextValue + divisor
    }, '')
}

class Contentful_DocumentLoaders implements INode {
    label: string
    name: string
    version: number
    description: string
    type: string
    icon: string
    category: string
    baseClasses: string[]
    credential: INodeParams
    inputs?: INodeParams[]
    outputs: INodeOutputsValue[]

    constructor() {
        this.label = 'Contentful'
        this.name = 'contentful'
        this.version = 1.1
        this.type = 'Document'
        this.icon = 'contentful.png'
        this.category = 'Document Loaders'
        this.description = `Load data from a Contentful Space`
        this.baseClasses = [this.type]
        this.credential = {
            label: 'Connect Credential',
            name: 'credential',
            type: 'credential',
            credentialNames: ['contentfulDeliveryApi']
        }
        this.inputs = [
            {
                label: 'Text Splitter',
                name: 'textSplitter',
                type: 'TextSplitter',
                optional: true
            },
            {
                label: 'API Type',
                name: 'apiType',
                type: 'options',
                options: [
                    {
                        label: 'Delivery API',
                        name: 'delivery'
                    },
                    {
                        label: 'Preview API',
                        name: 'preview'
                    }
                ],
                default: 'delivery'
            },
            {
                label: 'Config Utility',
                name: 'configUtility',
                type: 'contentfulConfig',
                default: JSON.stringify({
                    mainContentType: {
                        contentType: '',
                        fieldsToParse: []
                    },
                    embeddedContentTypes: [],
                    richTextParsingRules: {
                        'embedded-asset-block': true,
                        'embedded-entry-block': true,
                        'embedded-entry-inline': true
                    },
                    fieldsForCitation: {
                        titleField: 'fields.title',
                        slugField: 'fields.slug',
                        urlPrefix: 'https://mywebsite.com/'
                    }
                }),
                acceptVariable: true
            },
            {
                label: 'Include Field Names',
                name: 'includeFieldNames',
                type: 'boolean',
                default: false,
                optional: true,
                description: 'Include field names in the output'
            },
            {
                label: 'Environment Id',
                name: 'environmentId',
                type: 'string',
                placeholder: 'master',
                default: 'master',
                additionalParams: true,
                description:
                    'If your table URL looks like: https://app.contentful.com/spaces/abjv67t9l34s/environments/master-starter-v2/views/entries, master-starter-v2 is the environment id'
            },
            {
                label: 'Include Levels',
                name: 'include',
                type: 'number',
                optional: true,
                default: 1,
                additionalParams: true,
                description: 'The number of levels to include in the response'
            },
            {
                label: 'Include All',
                name: 'includeAll',
                type: 'boolean',
                optional: true,
                additionalParams: true,
                description: 'Include all entries in the response'
            },
            {
                label: 'Limit',
                name: 'limit',
                type: 'number',
                optional: true,
                additionalParams: true,
                description: 'The limit of items to return default is 50'
            },
            {
                label: 'Search Query',
                name: 'metadata',
                type: 'json',
                optional: true,
                additionalParams: true
            }
        ]
        this.outputs = [
            {
                label: 'Documents',
                name: 'document',
                baseClasses: this.baseClasses
            },
            {
                label: 'String',
                name: 'stringOutput',
                baseClasses: ['string', 'json']
            }
        ]
    }

    async init(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const credentialData = await getCredentialData(nodeData.credential ?? '', options)

        const apiType = nodeData.inputs?.apiType as string
        const environmentId = nodeData.inputs?.environmentId as string
        const textSplitter = nodeData.inputs?.textSplitter as TextSplitter
        const configUtility = (nodeData.inputs?.configUtility as string) ?? {}
        const metadata = nodeData.inputs?.metadata
        const include = nodeData.inputs?.include as number
        const limit = nodeData.inputs?.limit as number
        const includeAll = nodeData.inputs?.includeAll as boolean
        const includeFieldNames = nodeData.inputs?.includeFieldNames as boolean

        const deliveryToken = getCredentialParam('deliveryToken', credentialData, nodeData)
        const previewToken = getCredentialParam('previewToken', credentialData, nodeData)
        const spaceId = getCredentialParam('spaceId', credentialData, nodeData)

        const accessToken = apiType === 'preview' ? previewToken : deliveryToken
        const host = apiType === 'preview' ? 'preview.contentful.com' : 'cdn.contentful.com'

        const contentfulOptions: ContentfulLoaderParams = {
            spaceId,
            environmentId,
            accessToken,
            include,
            includeAll,
            limit,
            metadata,
            configUtility,
            host,
            includeFieldNames
        }

        const loader = new ContentfulLoader(contentfulOptions)

        let docs = []

        if (textSplitter) {
            docs = await loader.loadAndSplit(textSplitter)
        } else {
            docs = await loader.load()
        }

        const finaldocs = []
        if (metadata) {
            const parsedMetadata = typeof metadata === 'object' ? metadata : JSON.parse(metadata)

            for (const doc of docs) {
                const newdoc = {
                    ...doc,
                    metadata: {
                        ...doc.metadata,
                        ...parsedMetadata
                    }
                }
                finaldocs.push(newdoc)
            }
        } else {
            finaldocs.push(...docs)
        }

        const documentToPlainText = (doc: Document): string => {
            return doc.pageContent
        }

        if (nodeData?.outputs?.output === 'stringOutput') {
            return finaldocs.map((doc) => documentToPlainText(doc))
        } else {
            return finaldocs
        }
    }
}

interface ContentfulLoaderParams {
    spaceId: string
    environmentId: string
    accessToken: string
    include?: number
    limit?: number
    includeAll?: boolean
    metadata?: any
    configUtility: ContentTypeConfig | string
    host?: string
    includeFieldNames: boolean
}

interface ContentfulLoaderResponse {
    items: ContentfulEntry[]
    skip?: number
    limit?: number
    total?: number
}

interface ContentfulEntry {
    fields: any
    sys: any
}

interface IField {
    [key: string]: any
}

interface IContentObject {
    fields: IField
    sys: any
}

class ContentfulLoader extends BaseDocumentLoader {
    public readonly spaceId: string
    public readonly environmentId: string
    public readonly accessToken: string
    public readonly include?: number
    public readonly limit?: number
    public readonly includeAll?: boolean
    public readonly metadata?: ICommonObject
    public readonly configUtility: ContentfulConfig
    public readonly host?: string
    public readonly includeFieldNames: boolean

    constructor({
        spaceId,
        environmentId,
        accessToken,
        host,
        metadata = {},
        include,
        limit,
        includeAll,
        configUtility,
        includeFieldNames = true
    }: ContentfulLoaderParams) {
        super()
        this.spaceId = spaceId
        this.host = host
        this.environmentId = environmentId
        this.accessToken = accessToken
        this.includeAll = includeAll
        this.include = include
        this.limit = limit
        this.includeFieldNames = includeFieldNames

        if (typeof metadata === 'string' && metadata.trim() !== '') {
            try {
                this.metadata = JSON.parse(metadata)
            } catch (error) {
                console.warn('Failed to parse metadata:', error)
                this.metadata = {}
            }
        } else if (typeof metadata === 'object') {
            this.metadata = metadata
        } else {
            this.metadata = {}
        }

        if (typeof configUtility === 'string') {
            try {
                this.configUtility = JSON.parse(configUtility) as ContentfulConfig
            } catch (error) {
                console.warn('Failed to parse config:', error)
                this.configUtility = this.getDefaultConfig()
            }
        } else {
            this.configUtility = this.getDefaultConfig()
        }
    }

    private getDefaultConfig(): ContentfulConfig {
        return {
            mainContentType: {
                contentType: '',
                fieldsToParse: []
            },
            embeddedContentTypes: [],
            richTextParsingRules: {
                'embedded-asset-block': true,
                'embedded-entry-block': true,
                'embedded-entry-inline': true
            },
            fieldsForCitation: {
                titleField: 'fields.title',
                slugField: 'fields.slug',
                urlPrefix: 'https://www.example.com/'
            }
        }
    }

    public async load(): Promise<Document[]> {
        return this.runQuery()
    }

    private processContentObject(contentObject: IContentObject, contentTypeConfig: ContentTypeConfig): string {
        const fieldsToProcess = contentTypeConfig.fieldsToParse

        return fieldsToProcess
            .map((fieldPath: string) => {
                const fieldValue = this.getNestedProperty(contentObject, fieldPath)

                if (fieldValue === undefined) {
                    console.warn(`Field value for path ${fieldPath} is undefined in content object:`, contentObject)
                    return ''
                }

                const fieldName = fieldPath.split('.').pop() || fieldPath
                let processedValue = ''

                if (typeof fieldValue === 'object' && fieldValue.sys && fieldValue.sys.type === 'Asset') {
                    // Handle Asset type
                    const assetTitle = fieldValue.fields.title || 'Asset'
                    const assetUrl = fieldValue.fields.file.url
                    processedValue = `![${assetTitle}](https:${assetUrl})`
                } else if (typeof fieldValue === 'object' && fieldValue.nodeType === 'document') {
                    // Handle rich text
                    let plainText = documentToPlainTextString(
                        fieldValue,
                        '\n',
                        this.configUtility.richTextParsingRules,
                        this.processContentObject.bind(this)
                    )
                    processedValue = plainText.replaceAll('"', '')
                } else if (typeof fieldValue === 'string') {
                    processedValue = fieldValue.replaceAll('"', '')
                } else if (Array.isArray(fieldValue)) {
                    processedValue = fieldValue
                        .map((item) => {
                            if (typeof item === 'object' && item !== null && item.sys?.contentType?.sys?.id) {
                                const contentType = item.sys.contentType.sys.id
                                const embeddedConfig = this.configUtility.embeddedContentTypes.find(
                                    (config) => config.contentType === contentType
                                )
                                if (embeddedConfig) {
                                    try {
                                        return this.processContentObject(item, embeddedConfig)
                                    } catch (error) {
                                        console.error('Error processing nested content object:', error, item)
                                        return ''
                                    }
                                }
                            }
                            return this.processSimpleValue(item)
                        })
                        .filter((item) => item !== '')
                        .join(', ')
                } else if (typeof fieldValue === 'object' && fieldValue !== null) {
                    if (fieldValue.sys?.contentType?.sys?.id) {
                        const contentType = fieldValue.sys.contentType.sys.id
                        const embeddedConfig = this.configUtility.embeddedContentTypes.find((config) => config.contentType === contentType)
                        if (embeddedConfig) {
                            try {
                                processedValue = this.processContentObject(fieldValue, embeddedConfig)
                            } catch (error) {
                                console.error('Error processing embedded object:', error, fieldValue)
                                processedValue = ''
                            }
                        } else {
                            processedValue = this.processSimpleValue(fieldValue)
                        }
                    } else {
                        processedValue = this.processSimpleValue(fieldValue)
                    }
                } else {
                    processedValue = String(fieldValue)
                }

                return this.includeFieldNames ? `${fieldName}: ${processedValue}\n\n` : `${processedValue}\n\n`
            })
            .join('')
    }

    private processSimpleValue(value: any): string {
        if (typeof value === 'object' && value !== null) {
            if (value.sys && value.sys.type === 'Asset') {
                const assetTitle = value.fields.title || 'Asset'
                const assetUrl = value.fields.file.url
                return `![${assetTitle}](https:${assetUrl})`
            } else if (value.sys && value.sys.type === 'Entry') {
                return `Referenced Entry: ${value.sys.id}`
            } else {
                return JSON.stringify(value)
            }
        }
        return String(value)
    }

    private getNestedProperty(obj: any, path: string): any {
        return path.split('.').reduce((current, key) => {
            if (current === undefined) return undefined

            if (key.includes('[') && key.includes(']')) {
                const [arrayName, indexStr] = key.split('[')
                const index = parseInt(indexStr.replace(']', ''), 10)
                return current[arrayName] ? current[arrayName][index] : undefined
            }

            return current[key]
        }, obj)
    }

    private createDocumentFromEntry(entry: ContentfulEntry): Document {
        const textContent = this.processContentObject(entry, this.configUtility.mainContentType)
        const entryUrl = `https://app.contentful.com/spaces/${this.spaceId}/environments/${this.environmentId}/entries/${entry.sys.id}`

        const titlePath = this.configUtility.fieldsForCitation.titleField as string
        const slugPath = this.configUtility.fieldsForCitation.slugField as string

        const title = this.getNestedProperty(entry, titlePath) || entry.sys.id
        const slug = this.getNestedProperty(entry, slugPath) || entry.sys.id
        const url = `${this.configUtility.fieldsForCitation.urlPrefix}${slug}`

        return new Document({
            pageContent: textContent,
            metadata: {
                contentType: this.configUtility.mainContentType.contentType,
                source: url,
                entryId: entry.sys.id,
                doctype: 'contentfulEntry',
                title,
                contentfulUrl: entryUrl
            }
        })
    }

    private async runQuery(): Promise<Document[]> {
        let query: any = this.metadata || {}

        if (this.limit && !this.includeAll) {
            query.limit = this.limit
        }
        if (this.include) {
            query.include = this.include
        }

        if (this.configUtility.mainContentType.contentType) {
            query.content_type = this.configUtility.mainContentType.contentType
        }

        const client = contentful.createClient({
            space: this.spaceId,
            environment: this.environmentId,
            accessToken: this.accessToken,
            host: this.host
        })

        let allEntries: ContentfulEntry[] = []
        let total: number
        let skip = 0

        try {
            do {
                query.skip = skip
                const response: ContentfulLoaderResponse = await client.getEntries(query)
                allEntries = allEntries.concat(response.items)
                total = response.total || 0
                skip += response.items.length
            } while (this.includeAll && allEntries.length < total)

            return allEntries.map((entry) => this.createDocumentFromEntry(entry))
        } catch (error) {
            console.error('Error fetching entries from Contentful:', error)
            throw new Error(`Failed to fetch entries from Contentful: ${error.message}`)
        }
    }
}

module.exports = {
    nodeClass: Contentful_DocumentLoaders
}