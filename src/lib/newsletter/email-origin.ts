type SearchParamValue = string | string[] | undefined;

export type SearchParamsLike = Record<string, SearchParamValue>;

function hasValue(value: SearchParamValue, expected: string): boolean {
  if (Array.isArray(value)) return value.some((v) => v.toLowerCase() === expected);
  return value?.toLowerCase() === expected;
}

export function isNewsletterEmailVisit(searchParams: SearchParamsLike): boolean {
  return (
    hasValue(searchParams.from, "email") ||
    hasValue(searchParams.source, "email") ||
    hasValue(searchParams.utm_medium, "email") ||
    hasValue(searchParams.utm_source, "newsletter")
  );
}
