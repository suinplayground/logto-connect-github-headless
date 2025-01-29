export function info(message: string, ...data: unknown[]): void {
	const line = "=".repeat(message.length + 4);
	const color = (text: string): string =>
		`\x1b[48;2;176;196;222m\x1b[38;2;25;25;112m\x1b[1m${text}\x1b[0m`;
	const styledMessage = [line, `  ${message}  `, line].map(color).join("\n");
	console.info(styledMessage, ...data);
}
