import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-4xl font-bold">404</p>
      <Link href="/" className="mt-4 inline-block underline">
        TabiAI
      </Link>
    </div>
  );
}
