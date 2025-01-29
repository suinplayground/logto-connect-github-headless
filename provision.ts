import ky, { type KyInstance } from "ky";
import assert from "node:assert";
import * as httputils from "./httputils";
import { info } from "./info";

interface Token {
	access_token: string;
	expires_in: number;
	scope?: string;
	token_type: string;
}

interface User {
	id: string;
	username: string;
	createdAt: number;
}

interface Role {
	id: string;
	name: string;
}

interface Connector {
	id: string;
	connectorId: string;
}

interface Application {
	id: string;
	name: string;
}

interface ApplicationSecret {
	applicationId: string;
	name: string;
	value: string;
}

interface ProvisionResult {
	readonly application: {
		readonly id: string;
		readonly secret: string;
	};
	readonly gihtubConnector: {
		readonly id: string;
		readonly connectorId: string;
	};
}

assert(process.env.DEFAULT_TENANT_SECRET, "DEFAULT_TENANT_SECRET is required");
assert(process.env.ADMIN_TENANT_SECRET, "ADMIN_TENANT_SECRET is required");

const tenants = {
	admin: {
		endpoint: "http://localhost:3002/",
		resource: "https://admin.logto.app/api",
		port: 3002,
		apps: {
			admin: {
				clientId: "m-admin",
				secret: process.env.ADMIN_TENANT_SECRET,
			},
			default: {
				clientId: "m-default",
				secret: process.env.DEFAULT_TENANT_SECRET,
			},
		},
	},
	default: {
		endpoint: "http://localhost:3001/",
		resource: "https://default.logto.app/api",
		port: 3001,
	},
} as const;

const base = ky.create({
	hooks: {
		beforeRequest: [
			async (request) => {
				console.log(await httputils.format(request));
			},
		],
		afterResponse: [
			async (request, options, response) => {
				console.log(await httputils.format(response));
			},
		],
	},
});

const defaultTenant = base.extend({
	prefixUrl: tenants.default.endpoint,
});

const adminTenant = base.extend({
	prefixUrl: tenants.admin.endpoint,
});

interface ProvisionOptions {
	readonly application: {
		readonly name: string;
		readonly redirectUris: ReadonlyArray<string>;
		readonly postLogoutRedirectUris: ReadonlyArray<string>;
	};
	readonly user: {
		readonly username: string;
		readonly password: string;
	};
	readonly githubApp: {
		readonly clientId: string;
		readonly clientSecret: string;
	};
}

export async function provision(
	options: ProvisionOptions,
): Promise<ProvisionResult> {
	const { access_token } = await getTokenOfMachineDefault();
	const api = createDefaultTenatApi(access_token);
	const application = await createApplicationIfNotExists({
		api,
		...options.application,
	});
	const applicationSecret = await getApplicationSecret({
		api,
		applicationId: application.id,
	});
	const githubConnector = await createGithubConnectorIfNotExists({
		api,
		...options.githubApp,
	});
	await enableAccountCenter({ api });
	const user = await createUserIfNotExists({ api, ...options.user });
	return {
		application: {
			id: application.id,
			secret: applicationSecret.value,
		},
		gihtubConnector: {
			id: githubConnector.id,
			connectorId: githubConnector.connectorId,
		},
	};
}

async function getTokenOfMachineDefault(): Promise<Token> {
	info("Getting access token for default tenant");
	const tokenResponse = await adminTenant
		.post("oidc/token", {
			body: new URLSearchParams({
				grant_type: "client_credentials",
				client_id: tenants.admin.apps.default.clientId,
				client_secret: tenants.admin.apps.default.secret,
				resource: tenants.default.resource,
				scope: "all",
			}),
		})
		.json<Token>();
	return tokenResponse;
}

export function createDefaultTenatApi(token: string): KyInstance {
	return defaultTenant.extend({
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});
}

async function createApplicationIfNotExists({
	api,
	name,
	redirectUris,
	postLogoutRedirectUris,
}: {
	readonly api: KyInstance;
	readonly name: string;
	readonly redirectUris: ReadonlyArray<string>;
	readonly postLogoutRedirectUris: ReadonlyArray<string>;
}): Promise<Application> {
	info("Create application if not exists");
	let [application] = await api
		.get("api/applications", {
			searchParams: { "search.name": name, "mode.name": "exact" },
		})
		.json<Array<Application>>();

	if (!application) {
		application = await api
			.post("api/applications", {
				json: {
					type: "Traditional",
					name,
					oidcClientMetadata: { redirectUris, postLogoutRedirectUris },
				},
			})
			.json<Application>();
	}
	return application;
}

async function getApplicationSecret({
	api,
	applicationId,
}: {
	readonly api: KyInstance;
	readonly applicationId: string;
}): Promise<ApplicationSecret> {
	info("Get application secrets");
	const [applicationSecret] = await api
		.get(`api/applications/${applicationId}/secrets`)
		.json<Array<ApplicationSecret>>();
	assert(applicationSecret, "Application secret is required, but not found");
	return applicationSecret;
}

async function createUserIfNotExists({
	api,
	username,
	password,
}: {
	readonly api: KyInstance;
	readonly username: string;
	readonly password: string;
}): Promise<User> {
	info("Create user if not exists");
	let [user] = await api
		.get("api/users", {
			searchParams: { "search.username": username, "mode.username": "exact" },
		})
		.json<Array<User>>();

	if (!user) {
		user = await api
			.post("api/users", {
				json: { username, password },
			})
			.json<User>();
	}
	return user;
}

async function createGithubConnectorIfNotExists({
	api,
	clientId,
	clientSecret,
}: {
	readonly api: KyInstance;
	readonly clientId: string;
	readonly clientSecret: string;
}): Promise<Connector> {
	info("Create GitHub connector if not exists");
	const id = "github";
	const res = await api.get(`api/connectors/${id}`, {
		throwHttpErrors: false,
	});
	if (res.ok) {
		return await res.json<Connector>();
	}
	return await api
		.post("api/connectors", {
			json: {
				connectorId: "github-universal",
				config: { clientId, clientSecret },
				id,
				syncProfile: false,
			},
		})
		.json<Connector>();
}

async function enableAccountCenter({
	api,
}: {
	readonly api: KyInstance;
}): Promise<void> {
	info("Enable account center");
	await api.patch("api/account-center", {
		json: {
			enabled: true,
			fields: { social: "Edit" },
		},
	});
}
