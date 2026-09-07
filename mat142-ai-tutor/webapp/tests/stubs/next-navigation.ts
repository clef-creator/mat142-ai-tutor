/**
 * A stand-in for Next.js's navigation hooks.
 *
 * The real ones only work inside a running app. The tests render the tutor
 * screen on its own to look at the markup, and never navigate, so a hook that
 * does nothing is enough — and is honest about it: if a test ever did depend
 * on navigation, it would notice nothing happening rather than pass by luck.
 */

export function useRouter() {
  return {
    push: () => {},
    replace: () => {},
    refresh: () => {},
    back: () => {},
    forward: () => {},
    prefetch: () => {},
  };
}

export function usePathname(): string {
  return '/tutor';
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams();
}
