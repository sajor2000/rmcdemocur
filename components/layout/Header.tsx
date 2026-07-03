import Link from "next/link";
import Image from "next/image";

export function Header() {
  return (
    <header className="bg-rush-green text-white shadow-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/rush-logo.svg"
            alt="Rush University"
            width={120}
            height={36}
            className="h-9 w-auto brightness-0 invert"
            priority
          />
        </Link>
        <div className="flex items-center gap-6">
          <nav className="hidden gap-6 text-sm font-medium sm:flex">
            <Link href="/upload" className="hover:text-rush-yellow">
              Upload
            </Link>
            <Link href="/courses/1" className="hover:text-rush-yellow">
              Demo
            </Link>
            <Link href="/about" className="hover:text-rush-yellow">
              About
            </Link>
          </nav>
          <span className="font-heading text-lg font-bold tracking-tight">
            RushMap AI
          </span>
        </div>
      </div>
    </header>
  );
}
