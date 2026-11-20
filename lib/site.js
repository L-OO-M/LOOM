// Site-wide identity constants that more than one chrome needs.
//
// The copyright year used to be typed into each footer by hand, so the homepage
// and the inner pages could disagree about it in any given January. Read once at
// module load: a footer rolling over mid-session is not worth a re-render, and a
// long-lived server instance keeping last year's number until the next deploy is
// invisible to readers.
export const SITE_YEAR = new Date().getFullYear();

// Public accounts that belong to this project. One list, so the footer, the
// homepage halftone footer and the Organization structured data cannot disagree
// about where LOOM actually lives. `sameAs` may only ever list a profile that
// exists and is ours: add here when one is created, never as a placeholder.
export const SITE_SOCIAL = {
  instagram: "https://www.instagram.com/lets_loom._/",
  github: "https://github.com/L-OO-M"
};
