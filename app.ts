import http from "node:http";

import type { LogtoExpressConfig } from "@logto/express";
import { handleAuthRoutes, withLogto } from "@logto/express";
import cookieParser from "cookie-parser";
import type { Request, Response, NextFunction } from "express";
import express from "express";
import session from "express-session";
import { provision, createDefaultTenatApi } from "./provision";
import assert from "node:assert";
import { info } from "./info";

assert(
	process.env.GITHUB_APP_CLIENT_ID,
	"GITHUB_APP_CLIENT_ID is required. Please set it in .env file",
);
assert(
	process.env.GITHUB_APP_CLIENT_SECRET,
	"GITHUB_APP_CLIENT_SECRET is required. Please set it in .env file",
);

const logtoConfig = await provision({
	application: {
		name: "test",
		redirectUris: ["http://localhost:3000/logto/sign-in-callback"],
		postLogoutRedirectUris: ["http://localhost:3000/"],
	},
	user: {
		username: "test",
		password: "test",
	},
	githubApp: {
		clientId: process.env.GITHUB_APP_CLIENT_ID,
		clientSecret: process.env.GITHUB_APP_CLIENT_SECRET,
	},
});

const config: LogtoExpressConfig = {
	appId: logtoConfig.application.id,
	appSecret: logtoConfig.application.secret,
	endpoint: "http://localhost:3001",
	baseUrl: "http://localhost:3000",
	// Fetch user info from remote, this may slowdown the response time, not
	// recommended.
	fetchUserInfo: true,
	// Fetch access token from remote, this may slowdown the response time,
	// you can also add "resource" if needed.
	getAccessToken: true,
	// Fetch organization token from remote
	// Remember to add "UserScope.Organizations" scope
	getOrganizationToken: true,
	// 🚨🚨🚨 ⚠️ 💥 SUPER IMPORTANT!!! 💥 ⚠️ 🚨🚨🚨
	// The `identities` scope is required to link social connections.
	scopes: ["identities"],
};

const requireAuth = async (
	request: Request,
	response: Response,
	next: NextFunction,
) => {
	if (!request.user.isAuthenticated) {
		response.redirect("/logto/sign-in");
	}

	next();
};

const app = express();
app.use(cookieParser());
app.use(
	session({
		secret: "some-random-string", // This should be a random string in production
		cookie: { maxAge: 14 * 24 * 60 * 60 * 1000 },
		resave: false,
		saveUninitialized: false,
	}),
);
app.use(handleAuthRoutes(config));
app.use(express.urlencoded({ extended: true }));

app.get("/", withLogto(config), (request, response) => {
	const { user } = request;
	response.setHeader("content-type", "text/html");
	if (!user.isAuthenticated) {
		response.end(
			`<h1>Hello Logto</h1>
			<div><a href="/logto/sign-in">Sign In</a></div>`,
		);
		return;
	}

	response.end(`
		<h1>Hello Logto</h1>
		<h2>Menu</h2>
		<ul>
			<li><a href="/logto/sign-out">Sign Out</a></li>
			<li><a href="/step1">Start To Link GitHub Account</a></li>
		</ul>
		<h2>Profile</h2>
		<pre>${JSON.stringify(user, null, 2)}</pre>
	`);
});

app.get(
	"/step1",
	withLogto({
		...config,
		getAccessToken: true,
	}),
	requireAuth,
	(request, response) => {
		response.setHeader("content-type", "text/html");
		response.end(
			`<h1>Step 1: Authorize with Logto</h1>
			<form method="post" action="/step1">
				<p>Enter your Logto password to authorize the operation.</p>
				<P>For security reasons, the Logto Account API requires another layer of authorization for the operations that involve identifiers and other sensitive information.</p>
				<div>
					<label for="password">Password:</label>
					<input type="password" id="password" name="password" required>
				</div>
				<div>
					<button type="submit">Authroize</button>
				</div>
			</form>`,
		);
	},
);

// Stores the verification record IDs. Note: This is server-side global
// variable, it is not recommended to use in production.
const someStore = new Map<
	"passwordVerificationRecordId" | "socialVerificationRecordId",
	string
>();

app.post(
	"/step1",
	withLogto({
		...config,
		getAccessToken: true,
	}),
	requireAuth,
	async (request, response) => {
		const api = createDefaultTenatApi(request.user.accessToken as string);

		info("Get verification record ID by password");
		const res = await api.post("api/verifications/password", {
			json: {
				password: request.body.password,
			},
			throwHttpErrors: false,
		});
		if (!res.ok) {
			response.setHeader("content-type", "text/html");
			response.end(
				`<h1>Step 1: Authorize with Logto</h1>
				<p>Failed</p>
				<pre>${await res.text()}</pre>
				<p><a href="/step1">Try again</a></p>`,
			);
			return;
		}
		const json = await res.json<{
			verificationRecordId: string;
			expiresAt: string;
		}>();

		// Store the verification record ID for the step 3.
		someStore.set("passwordVerificationRecordId", json.verificationRecordId);

		response.setHeader("content-type", "text/html");
		response.end(
			`<h1>Step 1: Authorize with Logto</h1>
			<p>Scuccess</p>
			<p><a href="/step2">Continue to GitHub Authorization</a></p>
			<pre>${JSON.stringify(json, null, 2)}</pre>`,
		);
	},
);

// Link a new social connection
app.get(
	"/step2",
	withLogto({
		...config,
		getAccessToken: true,
	}),
	requireAuth,
	async (request, response) => {
		if (!someStore.has("passwordVerificationRecordId")) {
			response.setHeader("content-type", "text/html");
			response.end(
				`<p>The password verification record ID is missing. Please go back to the <a href="/step1">step 1</a>.</p>`,
			);
			return;
		}

		const api = createDefaultTenatApi(request.user.accessToken as string);

		info("Get social verification record ID");
		// To link a new social connection, first you should request an
		// authorization URL:
		const json = await api
			.post("api/verifications/social", {
				json: {
					// The ID of the social connector.
					connectorId: logtoConfig.gihtubConnector.id,
					// The redirect URI after the user authorizes the application,
					// you should host a web page at this URL and capture the
					// callback.
					redirectUri: "http://localhost:3000/step3",
					// The state to be returned after the user authorizes the
					// application, it is a random string that is used to prevent
					// CSRF attacks.
					state: "some-random-string",
				},
			})
			.json<{
				verificationRecordId: string; // e.g. "uo10qxeizsfo0fkd7vwes"
				authorizationUri: string; // e.g. "https://github.com/login/oauth/authorize?client_id=XXXXXXX&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Flogto%2Fsocial-callback&state=some-random-string&scope=read%3Auser+user%3Aemail";
				expiresAt: string; // e.g. "2025-01-27T05:42:30.086Z";
			}>();

		// In the response, you will find a `verificationRecordId`, keep it for
		// later use.

		// Store the new identifier verification record ID for the step 3.
		someStore.set("socialVerificationRecordId", json.verificationRecordId);

		response.setHeader("content-type", "text/html");
		response.end(
			`<h1>Step 2: Authorize with GitHub</h1>
			<p>Open the following link to authorize the application to access your GitHub account.</p>
			<pre>${JSON.stringify(json, null, 2)}</pre>
			<a href="${json.authorizationUri}">Open GitHub Authorization Page</a>`,
		);
	},
);

app.get(
	"/step3",
	withLogto({
		...config,
		getAccessToken: true,
	}),
	requireAuth,
	async (request, response) => {
		if (!someStore.has("passwordVerificationRecordId")) {
			response.setHeader("content-type", "text/html");
			response.end(
				`<p>The password verification record ID is missing. Please go back to the <a href="/step1">step 1</a>.</p>`,
			);
			return;
		}

		if (!someStore.has("socialVerificationRecordId")) {
			response.setHeader("content-type", "text/html");
			response.end(
				`<p>The social verification record ID is missing. Please go back to the <a href="/step2">step 2</a>.</p>`,
			);
			return;
		}

		info("User has authorized the application to access the GitHub account");

		const api = createDefaultTenatApi(request.user.accessToken as string);

		// After the user authorizes the application, you will receive a
		// callback at the `redirectUri` with the `state` parameter. Then you
		// can use the `POST /api/verifications/social/verify` endpoint to
		// verify the social connection.

		// The `connectorData` is the data returned by the social connector
		// after the user authorizes the application, you need to parse and get
		// the query parameters from the `redirectUri` in your callback page,
		// and wrap them as a JSON as the value of the `connectorData` field.
		const connectorData = {
			code: request.query.code,
			state: request.query.state,
		};

		info("Verify social connection");
		const json = await api
			.post("api/verifications/social/verify", {
				json: {
					connectorData,
					verificationRecordId: someStore.get("socialVerificationRecordId"),
				},
			})
			.json<{
				verificationRecordId: string;
			}>();

		// Finally, you can use the `POST /api/my-account/identities` endpoint
		// to link the social connection.
		info("Link the social connection");
		await api.post("api/my-account/identities", {
			headers: {
				"logto-verification-id": someStore.get("passwordVerificationRecordId"),
			},
			json: {
				newIdentifierVerificationRecordId: someStore.get(
					"socialVerificationRecordId",
				),
			},
		});

		info("🎉 Link GitHub Account Success");
		response.setHeader("content-type", "text/html");
		response.end(
			`<h1>Step 3: Link GitHub Account</h1>
			<p>Scuccess</p>
			<p><a href="/">Go back to the home page</a></p>`,
		);
		console.log("You can stop the server now.");
	},
);

const server = http.createServer(app);
server.listen(3000, () => {
	info(
		"Application started at http://localhost:3000. Open it in your browser.",
	);
});
