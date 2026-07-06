import Link from "next/link";
import Image from "next/image";

const navLinkClass =
  "text-sm font-medium text-neutral-300 transition-colors hover:text-rush-green";

export function Header() {
  return (
    <header className="border-b border-rush-green/20 bg-rush-black text-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center">
          <Image
            src="/rush-logo.png"
            alt="Rush University"
            width={300}
            height={67}
            className="h-9 w-auto"
            priority
          />
        </Link>
        <div className="flex items-center gap-6">
          <nav className="hidden gap-6 sm:flex">
            <Link href="/upload" className={navLinkClass}>
              Upload
            </Link>
            <Link href="/courses/1" className={navLinkClass}>
              Demo
            </Link>
            <Link href="/program" className={navLinkClass}>
              Program
            </Link>
            <Link href="/about" className={navLinkClass}>
              About
            </Link>
          </nav>
          <span className="hidden font-heading text-lg font-bold tracking-tight text-white sm:inline">
            RushMap <span className="text-rush-green">AI</span>
          </span>
        </div>
      </div>
    </header>
  );
}
