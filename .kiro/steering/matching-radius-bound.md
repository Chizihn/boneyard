# Matching runner must never exceed the configured max search radius

The matching runner must never return a candidate outside the configured
max search radius, even as a fallback.

Applies to: the generic expanding-search runner and every
`MatchingStrategy` implementation (Hallowear, Haint, and any future
vertical scaffolded via the MCP tool). If the expanding search reaches
`maxRadiusKm` with zero eligible candidates, the correct behavior is to
return an empty result with a reason — never to relax the radius
constraint itself to find "something." The radius bound is a hard limit,
not a soft preference.
