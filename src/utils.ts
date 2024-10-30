import type { Context } from "hono";
import { getConnInfo } from "hono/bun";

export function getAddressFromContext(c: Context) {
	return (
		c.req.header("cf-connecting-ip") ||
		c.req.header("x-forwarded-for") ||
		getConnInfo(c).remote.address
	);
}
