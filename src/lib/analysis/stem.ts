/**
 * A deliberately crude stemmer shared by verification and claim analysis:
 * strip a possessive and one common suffix, then keep at most seven letters.
 * It only needs to make "improvements" and "improved" meet, not be linguistics.
 */
export const stem = (w: string) =>
  w
    .toLowerCase()
    .replace(/['’]s$/, "")
    .replace(/(?:ing|edly|ed|ies|es|s|ly)$/, "")
    .slice(0, 7);
