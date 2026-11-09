import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	localStorage.clear();
});
it("shows friendly loading errors when the API cannot be reached", async () => {
	vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
	render(<App />);
	await waitFor(() =>
		expect(screen.getByText(/admissions service is unreachable/i)).toBeTruthy(),
	);
});
it("renders available classes and requires a student profile before applying", async () => {
	vi.stubGlobal(
		"fetch",
		vi
			.fn()
			.mockImplementation(
				(input: string) =>
					new Response(
						JSON.stringify(
							input.endsWith("/me/holds")
								? []
								: [
										{
											id: "c_1",
											name: "Class 6 - Morning Shift",
											totalSeats: 10,
											heldSeats: 1,
											confirmedSeats: 2,
											availableSeats: 7,
										},
									],
						),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					),
			),
	);
	render(<App />);
	await screen.findByText("Class 6 - Morning Shift");
	expect(screen.getByRole("button", { name: /apply now/i })).toHaveProperty(
		"disabled",
		true,
	);
});
