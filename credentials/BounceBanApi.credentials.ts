import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class BounceBanApi implements ICredentialType {
	name = 'bouncebanApi';
	displayName = 'BounceBan API';
	documentationUrl = 'https://bounceban.com/public/doc/api.html';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'Your BounceBan API key. Get it from https://bounceban.com/app/api/settings',
		},
	];

    authenticate: IAuthenticateGeneric = {

            type: 'generic',
            properties: {
							headers: {
								Authorization: '={{$credentials.apiKey}}',
							}
            },
    };
    test: ICredentialTestRequest = {
            request: {
								baseURL: 'https://api.bounceban.com',
								url: '/v1/account',
								method: 'GET',
								headers: {
									Authorization: '={{$credentials.apiKey}}',
								}
            },
    };
}
