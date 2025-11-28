import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IHttpRequestMethods,
	IHttpRequestOptions,
	NodeConnectionType,
	NodeApiError,
	JsonObject,
	NodeOperationError,
	NodeConnectionTypes
} from 'n8n-workflow';

export class Bounceban implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'BounceBan',
		name: 'bounceban',
		icon: { light:'file:Bounceban.svg', dark: 'file:Bounceban.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Verify email addresses using BounceBan API - We verify catch-all emails',
		defaults: {
			name: 'BounceBan',
		},
		inputs: [NodeConnectionTypes.Main] as NodeConnectionType[],
		outputs: [NodeConnectionTypes.Main] as NodeConnectionType[],
		credentials: [
			{
				name: 'bouncebanApi',
				required: true,
			},
		],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Verify Single Email',
						value: 'validateEmail',
						description: 'Verify a single email address',
						action: 'Verify a single email address',
					}
				],
				default: 'validateEmail',
			},
			{
				displayName: 'Email Address',
				name: 'email',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['validateEmail'],
					},
				},
				default: '',
				placeholder: 'example@domain.com',
				description: 'The email address to verify. Can be a static value or use expressions like {{ $JSON.email }}.',
			},
			{
				displayName: 'Processing Mode',
				name: 'processingMode',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['validateEmail'],
					},
				},
				options: [
					{
						name: 'Verify Email Sequentially (Default)',
						value: 'sequential',
						description: 'Verify email one by one',
					},
					{
						name: 'Verify Emails in Batch (Concurrent)',
						value: 'batch',
						description: 'Verify multiple items concurrently for better performance',
					},
				],
				default: 'sequential',
				description: 'Choose how to verify multiple emails',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						operation: ['validateEmail'],
					},
				},
				options: [
					{
						displayName: 'Mode',
						name: 'mode',
						type: 'options',
						options: [
							{
								name: 'regular',
								value: 'regular',
								description: "The default option for email verification. It does not assume that the domain of the email owner's current company website matches the domain of the email being verified.",
							},
							{
								name: 'deepverify',
								value: 'deepverify',
								description: "DeepVerify operates on the assumption that the domain of the email owner's current company website matches the domain of the email being verified. This assumption can improve the success rate of verifying accept-all emails. However, it is crucial to obtain the domain for the email owner's current company website from a reliable source, such as the email owner's LinkedIn profile or another trustworthy sales prospecting database. Learn more: https://support.bounceban.com/article/what-is-deepverify",
							},
						],
						default: 'regular',
						description: 'Setting the verification mode for the verification job',
					},
					{
						displayName: 'Disable Catchall Verify',
						name: 'disable_catchall_verify',
						type: 'options',
						description: '(Optional) Defaults to 0. When set to 1, BounceBan performs only basic SMTP verification. This may leave catch-all emails or those protected by ESGs (Email Security Gateways) unverified. For these addresses, the API will return "result: \'unknown\', score: -1", and the credit cost is "0".',
						options: [
							{
								name: 'Enable catch-all verification (0)',
								value: '0',
								description: "Enable catch-all verification. This is the recommended setting for most use cases.",
							},
							{
								name: 'Disable catch-all verification (1)',
								value: '1',
								description: 'Disable catch-all verification. This may leave catch-all emails or those protected by ESGs (Email Security Gateways) unverified. For these addresses, the API will return "result: \'unknown\', score: -1", and the credit cost is "0". This is not recommended for most use cases.',
							},
						],
						default: "0"
					},
					{
						displayName: 'Webhook URL',
						name: 'url',
						type: 'string',
						default: '',
						description: 'A webhook target URL specified to receive verification result event in real-time through an HTTP POST request. In case of a failed webhook event delivery, the system will attempt to resend the event up to two additional times within a short interval. For those verifying a substantial volume of emails, it\'s crucial to ensure that your webhook server is equipped to manage the incoming traffic.'
					}
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		await this.getCredentials('bouncebanApi');
		const items = this.getInputData();
		const processingMode = this.getNodeParameter('processingMode', 0) as string;

		const makeRequestWithRetry = async (options: IHttpRequestOptions, maxRetries = 15) => {
			for (let attempt = 0; attempt <= maxRetries; attempt++) {
				try {
					return await this.helpers.httpRequestWithAuthentication.call(
						this,
						'bouncebanApi',
						options,
					);
				} catch (error: any) {
					const {
						httpCode,
						// messages
					} = error;
					//this.logger.error(`Failed to request=> HttpCode: ${httpCode}  Message: ${messages}`);
					if (['408'].includes(httpCode) && attempt < maxRetries) {
						continue;
					}
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}
			}
		};

		const processItem = async (item: INodeExecutionData, itemIndex: number): Promise<INodeExecutionData> => {
			const operation = this.getNodeParameter('operation', itemIndex) as string;

			if (operation === 'validateEmail'){
				const email = this.getNodeParameter('email', itemIndex) as string;
				if (!email) {
					return {
						json: { ...item.json, bounceban_result: {error: "Email address is required"}},
						pairedItem: { item: itemIndex }
					};
				}

				let queries = {email};
				const additionalFields = this.getNodeParameter('additionalFields', itemIndex) as Record<string, string>;
				queries = {...queries, ...additionalFields};

				const options: IHttpRequestOptions = {
					method: 'GET' as IHttpRequestMethods,
					url: 'https://api-waterfall.bounceban.com/v1/verify/single',
					qs: queries,
					headers: {
						"utc_source": "n8n_node"
					},
					json: true,
					skipSslCertificateValidation: true,
				};

				const verifyResult = await makeRequestWithRetry(options);
				return {
					json: { ...item.json, bounceban_result: verifyResult },
					pairedItem: { item: itemIndex }
				};
			} else {
				throw new NodeOperationError(this.getNode(), "Unknown operation", {
					description: `Unknown operation: ${operation}`,
					itemIndex,
				});
			}
		};

		if (processingMode === 'batch') {
			// Batch mode: process items concurrently (original behavior)
			const promises = items.map(async (item, itemIndex) => {
				try {
					return await processItem(item, itemIndex);
				} catch (error) {
					// In batch mode, we catch errors and return them as part of the result
					return {
						json: { ...item.json, bounceban_result: { error: error.message } },
						pairedItem: { item: itemIndex }
					};
				}
			});
			const returnItems = await Promise.all(promises);
			return [returnItems];
		} else {
			const returnData: INodeExecutionData[] = [];
			// Sequential mode: process items one by one
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const item = items[itemIndex];
					const result = await processItem(item, itemIndex);
					returnData.push(result);
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: { ...items[itemIndex].json, bounceban_result: {error: error.message}},
							pairedItem: {item: itemIndex},
						});
						continue
					}
					throw new NodeOperationError(this.getNode(), error as Error, {
						description: error.description,
						itemIndex,
					});
				}
			}
			return [returnData];
		}
	}
}
