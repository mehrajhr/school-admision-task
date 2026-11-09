import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ArrowDownUp,
	ArrowRight,
	Check,
	Clock3,
	GraduationCap,
	LayoutDashboard,
	Plus,
	RefreshCw,
	ShieldCheck,
	Users,
	X,
} from "lucide-react";
import { api, type Hold, type SchoolClass } from "./api";

const statusLabel: Record<Hold["status"], string> = {
	HELD: "Reserved",
	CONFIRMED: "Enrolled",
	EXPIRED: "Expired",
	CANCELLED: "Cancelled",
};
const statusTone: Record<Hold["status"], string> = {
	HELD: "badge-warning",
	CONFIRMED: "badge-success",
	EXPIRED: "badge-ghost",
	CANCELLED: "badge-ghost",
};
function remaining(expiresAt: string) {
	return Math.max(
		0,
		Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
	);
}
function countdown(n: number) {
	return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

export default function App() {
	const [student, setStudent] = useState(
		() => localStorage.getItem("studentId") || "",
	);
	const [draftStudent, setDraftStudent] = useState(student);
	const [classes, setClasses] = useState<SchoolClass[]>([]);
	const [holds, setHolds] = useState<Hold[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [showCreate, setShowCreate] = useState(false);
	const [className, setClassName] = useState("");
	const [capacity, setCapacity] = useState("30");
	const [busy, setBusy] = useState("");
	const [now, setNow] = useState(Date.now());
	const [tab, setTab] = useState<"classes" | "applications">("classes");
	const [query, setQuery] = useState("");

	const refresh = useCallback(
		async (quiet = false) => {
			if (!quiet) setLoading(true);
			try {
				const [nextClasses, nextHolds] = await Promise.all([
					api<SchoolClass[]>("/classes", student),
					student ? api<Hold[]>("/me/holds", student) : Promise.resolve([]),
				]);
				setClasses(nextClasses);
				setHolds(nextHolds);
				setError("");
			} catch (e) {
				setError(e instanceof Error ? e.message : "Unable to load admissions.");
			} finally {
				if (!quiet) setLoading(false);
			}
		},
		[student],
	);

	useEffect(() => {
		void refresh();
		const poll = window.setInterval(() => {
			void refresh(true);
			setNow(Date.now());
		}, 3000);
		const tick = window.setInterval(() => setNow(Date.now()), 1000);
		return () => {
			clearInterval(poll);
			clearInterval(tick);
		};
	}, [refresh]);

	useEffect(() => {
		const expired = holds.filter(
			(h) => h.status === "HELD" && remaining(h.expiresAt) === 0,
		);
		if (expired.length)
			setHolds((list) =>
				list.map((h) =>
					expired.some((item) => item.holdId === h.holdId)
						? { ...h, status: "EXPIRED" }
						: h,
				),
			);
	}, [now]);

	const visibleClasses = useMemo(
		() =>
			classes.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())),
		[classes, query],
	);
	const activeHolds = holds.filter((h) => h.status === "HELD");
	const run = async (
		key: string,
		action: () => Promise<unknown>,
		message: string,
	) => {
		setBusy(key);
		setError("");
		setNotice("");
		try {
			await action();
			setNotice(message);
			await refresh(true);
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "The action could not be completed.",
			);
			await refresh(true);
		} finally {
			setBusy("");
		}
	};
	const saveStudent = (event: React.FormEvent) => {
		event.preventDefault();
		if (!/^\d{17}$/.test(draftStudent)) {
			setError("Enter a valid 17-digit student registration number.");
			return;
		}
		localStorage.setItem("studentId", draftStudent);
		setStudent(draftStudent);
		setError("");
		setNotice("Your student profile is ready.");
	};

	return (
		<div className="min-h-screen bg-base-200 text-base-content lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
			<aside className="hidden min-h-screen flex-col border-r border-base-300 bg-base-100 px-5 py-7 lg:flex">
				<a
					className="flex items-center gap-3 px-1 font-bold tracking-tight text-lg"
					href="#top"
				>
					<span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-content">
						<GraduationCap size={23} />
					</span>
					<span>
						northstar
						<span className="font-normal text-base-content/60">academy</span>
					</span>
				</a>
				<div className="mt-9 flex items-center gap-3 rounded-box border border-base-300 p-3">
					<div className="avatar placeholder">
						<div className="w-10 rounded-lg bg-secondary text-secondary-content">
							<span className="font-bold">N</span>
						</div>
					</div>
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-semibold">Northstar Academy</p>
						<p className="text-xs text-base-content/55">Admissions portal</p>
					</div>
				</div>
				<p className="mb-2 mt-9 px-3 text-xs font-bold tracking-widest text-base-content/45">
					WORKSPACE
				</p>
				<ul className="menu menu-sm gap-1 p-0">
					<li>
						<button
							className={tab === "classes" ? "active" : ""}
							onClick={() => setTab("classes")}
						>
							<LayoutDashboard size={17} />
							Class directory
						</button>
					</li>
					<li>
						<button
							className={tab === "applications" ? "active" : ""}
							onClick={() => setTab("applications")}
						>
							<ArrowDownUp size={17} />
							My applications
							{activeHolds.length > 0 && (
								<span className="badge badge-sm badge-primary ml-auto">
									{activeHolds.length}
								</span>
							)}
						</button>
					</li>
				</ul>
				<div className="mt-auto rounded-box bg-base-200 p-4">
					<p className="text-sm font-semibold">Need a hand?</p>
					<p className="mt-1 text-xs leading-relaxed text-base-content/60">
						Our admissions team is here to help with your application.
					</p>
					<a
						className="link link-primary mt-3 inline-flex items-center gap-1 text-xs"
						href="mailto:admissions@northstar.example"
					>
						Contact admissions <ArrowRight size={13} />
					</a>
					<div className="mt-5 flex items-center gap-2 border-t border-base-300 pt-4 text-xs text-base-content/55">
						<ShieldCheck size={15} />
						Secure admissions portal
					</div>
				</div>
			</aside>

			<main id="top" className="min-w-0">
				<header className="navbar min-h-14 border-b border-base-300 bg-base-100 px-4 sm:px-8 lg:px-10">
					<div className="flex-1 text-xs text-base-content/55">
						Admissions <span className="mx-2 text-base-content/25">/</span>
						<b className="font-medium text-base-content">
							{tab === "classes" ? "Class directory" : "My applications"}
						</b>
					</div>
					<div className="flex items-center gap-2 sm:gap-4">
						<button
							className="btn btn-ghost btn-sm btn-square"
							title="Refresh"
							onClick={() => void refresh()}
						>
							<RefreshCw size={16} />
						</button>
						<span className="hidden border-l border-base-300 pl-4 text-xs text-base-content/60 sm:inline">
							2026–27 Academic year
						</span>
						<div className="badge badge-outline h-8 gap-2 px-3">
							<span className="grid size-5 place-items-center rounded-full bg-secondary text-[10px] font-bold text-secondary-content">
								{student ? "S" : "?"}
							</span>
							<span>
								{student ? `Student · ${student.slice(-4)}` : "Guest student"}
							</span>
						</div>
					</div>
				</header>
				<nav aria-label="Main navigation" className="flex gap-2 border-b border-base-300 bg-base-100 px-4 py-2 lg:hidden">
					<button className={`btn btn-sm flex-1 ${tab === "classes" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("classes")}>
						<LayoutDashboard size={15} />Class directory
					</button>
					<button className={`btn btn-sm flex-1 ${tab === "applications" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("applications")}>
						<ArrowDownUp size={15} />My applications
						{activeHolds.length > 0 && <span className="badge badge-sm">{activeHolds.length}</span>}
					</button>
				</nav>

				<div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
					<div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[.16em] text-primary">
						<span className="badge badge-success badge-xs" />
						2026–27 ENROLLMENT · NOW OPEN
					</div>
					<div className="mb-7 flex items-center justify-between gap-6">
						<div>
							<h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
								{tab === "classes" ? (
									<>
										Find your <span className="text-primary">class.</span>
									</>
								) : (
									<>
										Your <span className="text-primary">applications.</span>
									</>
								)}
							</h1>
							<p className="mt-3 max-w-xl text-sm leading-relaxed text-base-content/60">
								{tab === "classes"
									? "A great education starts with the right fit. Explore available classes and reserve your place."
									: "Keep track of your seat reservations and enrollment status in one place."}
							</p>
						</div>
						<div className="hidden size-28 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/5 text-primary md:grid">
							<GraduationCap size={52} strokeWidth={1.3} />
						</div>
					</div>

					<form
						className="mb-9 flex flex-wrap items-center gap-3 rounded-box border border-base-300 bg-base-100 p-3 sm:p-4"
						onSubmit={saveStudent}
					>
						<div className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary/15 text-secondary">
							<Users size={19} />
						</div>
						<div className="min-w-[180px] flex-1">
							<label
								htmlFor="student-id"
								className="mb-1 block text-[10px] font-bold tracking-wider text-base-content/50"
							>
								STUDENT REGISTRATION NUMBER
							</label>
							<input
								id="student-id"
								className="input input-ghost input-sm h-7 w-full px-0 text-sm focus:bg-transparent"
								inputMode="numeric"
								maxLength={17}
								placeholder="Enter your 17-digit number"
								value={draftStudent}
								onChange={(e) =>
									setDraftStudent(e.target.value.replace(/\D/g, ""))
								}
							/>
						</div>
						<button className="btn btn-primary btn-sm" type="submit">
							{student ? "Update profile" : "Get started"}{" "}
							<ArrowRight size={15} />
						</button>
						<span className="hidden items-center gap-1 text-xs text-base-content/45 xl:flex">
							<ShieldCheck size={14} />
							Your details stay private
						</span>
					</form>

					{error && (
						<div role="alert" className="alert alert-error mb-5 py-3 text-sm">
							<span>{error}</span>
							<button
								className="btn btn-ghost btn-xs btn-square ml-auto"
								onClick={() => setError("")}
								aria-label="Dismiss"
							>
								<X size={16} />
							</button>
						</div>
					)}
					{notice && (
						<div
							role="status"
							className="alert alert-success mb-5 py-3 text-sm"
						>
							<Check size={16} />
							<span>{notice}</span>
							<button
								className="btn btn-ghost btn-xs btn-square ml-auto"
								onClick={() => setNotice("")}
								aria-label="Dismiss"
							>
								<X size={16} />
							</button>
						</div>
					)}

					<div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
						<div>
							<p className="mb-1 text-[10px] font-bold tracking-[.17em] text-base-content/45">
								YOUR OPPORTUNITY
							</p>
							<h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
								{tab === "classes" ? "Explore classes" : "Application overview"}
								<span className="badge badge-ghost badge-sm">
									{tab === "classes" ? visibleClasses.length : holds.length}
								</span>
							</h2>
						</div>
						<div className="flex items-center gap-2">
							{tab === "classes" && (
								<label className="input input-bordered input-sm flex h-9 items-center gap-2">
									<span className="text-lg text-base-content/45">⌕</span>
									<input
										className="w-full sm:w-40"
										placeholder="Search classes..."
										value={query}
										onChange={(e) => setQuery(e.target.value)}
									/>
								</label>
							)}
							<button
								className="btn btn-outline btn-sm"
								onClick={() => {
									setShowCreate((v) => !v);
									setError("");
								}}
							>
								<Plus size={16} /> Add a class
							</button>
						</div>
					</div>

					{showCreate && (
						<form
							className="card mb-4 border border-base-300 bg-base-100 shadow-sm"
							onSubmit={(e) => {
								e.preventDefault();
								if (!className.trim()) {
									setError("Add a name for this class.");
									return;
								}
								void run(
									"create",
									() =>
										api("/classes", undefined, {
											method: "POST",
											body: JSON.stringify({
												name: className.trim(),
												totalSeats: Number(capacity),
											}),
										}).then(() => {
											setClassName("");
											setShowCreate(false);
										}),
									"Class added to the directory.",
								);
							}}
						>
							<div className="card-body grid gap-3 p-4 sm:grid-cols-[1fr_130px_auto_auto] sm:items-end">
								<label className="form-control">
									<span className="label-text mb-1 text-xs font-semibold">
										Class name
									</span>
									<input
										className="input input-bordered input-sm"
										value={className}
										onChange={(e) => setClassName(e.target.value)}
										placeholder="e.g. Class 6 - Morning Shift"
										maxLength={100}
									/>
								</label>
								<label className="form-control">
									<span className="label-text mb-1 text-xs font-semibold">
										Total seats
									</span>
									<input
										className="input input-bordered input-sm"
										type="number"
										min="1"
										max="100000"
										value={capacity}
										onChange={(e) => setCapacity(e.target.value)}
									/>
								</label>
								<button
									disabled={busy === "create"}
									className="btn btn-primary btn-sm"
								>
									Create class <ArrowRight size={15} />
								</button>
								<button
									type="button"
									className="btn btn-ghost btn-square btn-sm"
									onClick={() => setShowCreate(false)}
									aria-label="Close"
								>
									<X size={16} />
								</button>
							</div>
						</form>
					)}

					{tab === "classes" ? (
						<>
							{loading ? (
								<div className="grid min-h-52 place-items-center rounded-box border border-base-300 bg-base-100">
									<span className="loading loading-spinner loading-md text-primary" />
								</div>
							) : visibleClasses.length ? (
								<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
									{visibleClasses.map((c, i) => {
										const pct = Math.round(
											(c.availableSeats / c.totalSeats) * 100,
										);
										const own = holds.find(
											(h) =>
												h.classId === c.id &&
												["HELD", "CONFIRMED"].includes(h.status),
										);
										const isBusy = busy === c.id;
										return (
											<article
												className="card border border-base-300 bg-base-100 shadow-sm transition-shadow hover:shadow-md"
												key={c.id}
											>
												<div className="card-body gap-3 p-5">
													<div className="flex items-center justify-between">
														<div
															className={`grid size-10 place-items-center rounded-xl ${["bg-primary/10 text-primary", "bg-secondary/15 text-secondary", "bg-accent/15 text-accent"][i % 3]}`}
														>
															<GraduationCap size={21} />
														</div>
														<span
															className={`badge badge-sm ${c.availableSeats ? "badge-success badge-outline" : "badge-error badge-outline"}`}
														>
															{c.availableSeats ? "ENROLLMENT OPEN" : "FULL"}
														</span>
													</div>
													<div>
														<h3 className="card-title mt-1 text-base">
															{c.name}
														</h3>
														<p className="mt-1 text-xs text-base-content/50">
															2026–27 Academic year · Rolling admission
														</p>
													</div>
													<progress
														className="progress progress-primary h-1.5 w-full"
														value={pct}
														max="100"
													/>
													<div className="flex justify-between text-xs text-base-content/55">
														<span>
															<b className="text-base-content">
																{c.availableSeats}
															</b>{" "}
															seats available
														</span>
														<span>
															{c.confirmedSeats + c.heldSeats} of {c.totalSeats}{" "}
															filled
														</span>
													</div>
													<div className="card-actions mt-1 items-center justify-between border-t border-base-200 pt-3">
														<div className="avatar-group -space-x-3 rtl:space-x-reverse">
															<div className="avatar placeholder">
																<div className="w-7 rounded-full bg-primary/10 text-[9px] text-primary">
																	<span>A</span>
																</div>
															</div>
															<div className="avatar placeholder">
																<div className="w-7 rounded-full bg-secondary/15 text-[9px] text-secondary">
																	<span>M</span>
																</div>
															</div>
															<div className="avatar placeholder">
																<div className="w-7 rounded-full bg-accent/15 text-[9px] text-accent">
																	<span>J</span>
																</div>
															</div>
															<div className="avatar placeholder">
																<div className="w-7 rounded-full bg-base-200 text-[9px]">
																	<span>+{Math.max(0, c.confirmedSeats)}</span>
																</div>
															</div>
														</div>
														{own?.status === "CONFIRMED" ? (
															<span className="flex items-center gap-1 text-sm font-semibold text-success">
																<Check size={15} /> Enrolled
															</span>
														) : (
															<button
																disabled={
																	!student ||
																	!c.availableSeats ||
																	!!own ||
																	isBusy
																}
																title={
																	!student
																		? "Enter your student registration number first"
																		: own
																			? "You already have an application for this class"
																			: ""
																}
																className="btn btn-outline btn-sm"
																onClick={() =>
																	void run(
																		c.id,
																		() =>
																			api(`/classes/${c.id}/holds`, student, {
																				method: "POST",
																			}),
																		"Your seat has been reserved for 10 minutes.",
																	)
																}
															>
																{isBusy ? (
																	<span className="loading loading-spinner loading-xs" />
																) : own ? (
																	"Application active"
																) : (
																	"Apply now"
																)}
																{!own && !isBusy && <ArrowRight size={14} />}
															</button>
														)}
													</div>
												</div>
											</article>
										);
									})}
								</div>
							) : (
								<div className="hero min-h-56 rounded-box border border-base-300 bg-base-100">
									<div className="hero-content text-center">
										<div className="max-w-md">
											<GraduationCap
												className="mx-auto text-primary"
												size={36}
											/>
											<h3 className="mt-3 text-lg font-bold">
												No classes found
											</h3>
											<p className="py-2 text-sm text-base-content/60">
												Try another search or add a class to get started.
											</p>
										</div>
									</div>
								</div>
							)}
						</>
					) : holds.length ? (
						<div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
							<table className="table">
								<thead>
									<tr>
										<th>Class</th>
										<th>Status</th>
										<th>Time remaining</th>
										<th className="text-right">Actions</th>
									</tr>
								</thead>
								<tbody>
									{holds.map((h) => {
										const left = remaining(h.expiresAt);
										const state =
											h.status === "HELD" && left === 0 ? "EXPIRED" : h.status;
										return (
											<tr key={h.holdId}>
												<td>
													<div className="flex items-center gap-3">
														<div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
															<GraduationCap size={20} />
														</div>
														<div>
															<div className="font-semibold">
																{h.className ||
																	classes.find((c) => c.id === h.classId)
																		?.name ||
																	"Class application"}
															</div>
															<div className="text-xs text-base-content/50">
																Application #{h.holdId.slice(-8)}
															</div>
														</div>
													</div>
												</td>
												<td>
													<span className={`badge ${statusTone[state]}`}>
														{statusLabel[state]}
													</span>
												</td>
												<td>
													{state === "HELD" ? (
														<span className="flex items-center gap-1 text-warning">
															<Clock3 size={14} />
															{countdown(left)}
														</span>
													) : (
														<span className="text-base-content/45">—</span>
													)}
												</td>
												<td>
													<div className="flex justify-end gap-2">
														{state === "HELD" && (
															<>
																<button
																	disabled={busy === h.holdId}
																	className="btn btn-primary btn-sm"
																	onClick={() =>
																		void run(
																			h.holdId,
																			() =>
																				api(
																					`/holds/${h.holdId}/confirm`,
																					student,
																					{ method: "POST" },
																				),
																			"Congratulations! Your enrollment is confirmed.",
																		)
																	}
																>
																	Confirm & enroll
																</button>
																<button
																	disabled={busy === h.holdId}
																	className="btn btn-ghost btn-sm text-error"
																	onClick={() =>
																		void run(
																			h.holdId,
																			() =>
																				api(`/holds/${h.holdId}`, student, {
																					method: "DELETE",
																				}),
																			"Your reservation has been cancelled.",
																		)
																	}
																>
																	Cancel
																</button>
															</>
														)}
														{state === "CONFIRMED" && (
															<span className="flex items-center gap-1 text-success">
																<Check size={15} />
																Seat confirmed
															</span>
														)}
													</div>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					) : (
						<div className="hero min-h-56 rounded-box border border-base-300 bg-base-100">
							<div className="hero-content text-center">
								<div className="max-w-md">
									<Clock3 className="mx-auto text-primary" size={34} />
									<h3 className="mt-3 text-lg font-bold">
										No applications yet
									</h3>
									<p className="py-2 text-sm text-base-content/60">
										Choose a class from the directory to reserve your seat.
									</p>
									<button
										className="btn btn-primary btn-sm"
										onClick={() => setTab("classes")}
									>
										Browse classes <ArrowRight size={15} />
									</button>
								</div>
							</div>
						</div>
					)}

					<div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-base-content/55">
						<ShieldCheck size={15} />
						<span>
							Your seat is held for{" "}
							<b className="text-base-content/75">10 minutes</b> while you
							complete enrollment.
						</span>
						<span className="hidden px-1 text-base-content/25 sm:inline">
							|
						</span>
						<span>
							Applications are processed on a first-come, first-served basis.
						</span>
					</div>
				</div>
				<footer className="footer footer-center border-t border-base-300 bg-base-100 p-4 text-xs text-base-content/55 sm:footer-horizontal sm:justify-between sm:px-8 lg:px-10">
					<span>© 2026 Northstar Academy</span>
					<span>
						Questions?{" "}
						<a
							className="link link-primary"
							href="mailto:admissions@northstar.example"
						>
							Contact admissions
						</a>
					</span>
					<button
						className="btn btn-ghost btn-xs"
						onClick={() => void refresh()}
					>
						<RefreshCw size={13} />
						Updated moments ago
					</button>
				</footer>
			</main>
		</div>
	);
}
