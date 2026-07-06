export function Footer() {
  return (
    <footer className="border-t border-rush-green/20 bg-rush-black py-4 text-center text-sm text-neutral-400">
      <p>
        © {new Date().getFullYear()} Rush University.{" "}
        <span className="text-rush-green">RushMap AI</span> — Curriculum Mapping Demo.
      </p>
    </footer>
  );
}
