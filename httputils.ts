import { createEmphasize } from "emphasize";
import http from "highlight.js/lib/languages/http";
import json from "highlight.js/lib/languages/json";

export async function format(
	object: Request | Response,
	{ color = true }: Option = {},
): Promise<string> {
	return await (object instanceof Request
		? formatRequest(object, { color })
		: formatResponse(object, { color }));
}

type Option = { readonly color?: undefined | boolean };

const emphasize = createEmphasize({ http, json });

async function formatRequest(
	request: Request,
	option: Option,
): Promise<string> {
	const url = new URL(request.url);
	const text = `${request.method} ${url.pathname + url.search} HTTP/1.1
${formatHeaders(request.headers, { host: url.host })}

${await formatBody(request, option)}
`;
	return option.color ? highlightHTTP(text) : text;
}

async function formatResponse(
	response: Response,
	option: Option,
): Promise<string> {
	const text = `HTTP/1.1 ${response.status} ${response.statusText}
${formatHeaders(response.headers)}

${await formatBody(response, option)}
`;
	return option.color ? highlightHTTP(text) : text;
}

function formatHeaders(
	headers: Headers,
	{ host }: { host?: string } = {},
): string {
	return [...headers.entries(), ...(host ? [["host", host]] : [])]
		.toSorted(([key1], [key2]) =>
			(key1 as string).localeCompare(key2 as string),
		)
		.map(([key, value]) => `${key as string}: ${value}`)
		.join("\n");
}

async function formatBody(
	r: Request | Response,
	{ color }: Option,
): Promise<string> {
	const cloned = r.clone();
	if (cloned.headers.get("content-type")?.includes("application/json")) {
		const data = await cloned.json();
		const json = JSON.stringify(data, null, 2);
		return color ? highlightJSON(json) : json;
	}
	if (
		cloned.headers
			.get("content-type")
			?.includes("application/x-www-form-urlencoded")
	) {
		return cloned.text();
	}
	return cloned.text();
}

function highlightJSON(json: string): string {
	return emphasize.highlight("json", json).value;
}

function highlightHTTP(http: string): string {
	return emphasize.highlight("http", http).value;
}
