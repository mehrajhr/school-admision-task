export type SchoolClass = {
	id: string;
	name: string;
	totalSeats: number;
	heldSeats: number;
	confirmedSeats: number;
	availableSeats: number;
};
export type Hold = {
	holdId: string;
	classId: string;
	className?: string;
	studentId?: string;
	status: "HELD" | "CONFIRMED" | "EXPIRED" | "CANCELLED";
	expiresAt: string;
};
const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export async function api<T>(
	path: string,
	student?: string,
	init: RequestInit = {},
): Promise<T> {
	const headers = new Headers(init.headers);
	headers.set("Content-Type", "application/json");
	if (student) headers.set("X-Student-Id", student);
	let response: Response;
	try {
		response = await fetch(`${base}${path}`, { ...init, headers });
	} catch {
		throw new Error(
			"The admissions service is unreachable. Please check your connection and try again.",
		);
	}
	if (!response.ok) {
		let message = "Something went wrong. Please try again.";
		try {
			message = (await response.json()).error || message;
		} catch {
			/* use friendly fallback */
		}
		throw new Error(message);
	}
	if (response.status === 204) return undefined as T;
	return response.json() as Promise<T>;
}
