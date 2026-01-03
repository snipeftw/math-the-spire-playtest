declare namespace JSX {
  // Minimal JSX typing shim to unblock editor typechecking when @types/react is not installed.
  // This is intentionally permissive.
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
