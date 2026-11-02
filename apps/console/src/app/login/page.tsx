import Link from "next/link";

export default function Login() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <section className="w-full max-w-md rounded-2xl border border-zinc-800 p-8">
        <Link href="/" className="text-sm text-zinc-500">
          ← KIYT
        </Link>

        <h1 className="mt-8 text-3xl font-semibold">Log in</h1>

        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Member authentication is activated in the authentication module.
          No fake session is enabled.
        </p>
      </section>
    </main>
  );
}
