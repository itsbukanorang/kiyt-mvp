import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-black px-6 text-white">
      <nav className="mx-auto flex max-w-6xl items-center justify-between py-8">
        <div className="text-xl font-semibold tracking-tight">KIYT</div>

        <div className="flex gap-3">
          <Link
            href="/login"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm"
          >
            Log in
          </Link>

          <Link
            href="/signup"
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
          >
            Sign up
          </Link>
        </div>
      </nav>

      <section className="mx-auto flex min-h-[75vh] max-w-6xl items-center">
        <div className="max-w-3xl">
          <p className="mb-5 text-sm uppercase tracking-[0.25em] text-zinc-500">
            Cognitive Intelligence
          </p>

          <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">
            Intelligence that learns from outcomes.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">
            KIYT provides a cognitive runtime for applications that need
            decisions, observations, memory, and continuous improvement.
          </p>
        </div>
      </section>
    </main>
  );
}
