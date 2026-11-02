import Link from "next/link";

export default function Signup() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <section className="w-full max-w-md rounded-2xl border border-zinc-800 p-8">
        <Link href="/" className="text-sm text-zinc-500">
          ← KIYT
        </Link>

        <h1 className="mt-8 text-3xl font-semibold">Create account</h1>

        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Better Auth and PostgreSQL will provide the real signup flow.
        </p>
      </section>
    </main>
  );
}
