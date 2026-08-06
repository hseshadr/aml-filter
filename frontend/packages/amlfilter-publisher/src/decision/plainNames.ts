// The ordinary-name vocabulary: the control group for the false-positive rate.
//
// WHY A SECOND NEGATIVE SET EXISTS. ./negatives builds names by recombining
// elements of two real designations, so every token is a token the sanctions list
// publishes. That is the adversarial case, and it measures what it should — but
// it saturates: the live lexical gate's escape hatch fires on whole-token
// equality, so essentially every recombined name produces an alert and the
// measured false-positive rate pins at 1.0. A rate that cannot move is a gate
// that cannot fail, which is the exact defect this repository keeps finding in
// its own guards.
//
// So the negatives come in two populations, reported side by side and NEVER
// pooled into one number:
//
//   clean-hard   recombined list tokens.  100% token overlap.  Upper bound.
//   clean-plain  this vocabulary.           0% token overlap.  Lower bound.
//
// The truth for any real screening population is between them, much closer to
// clean-plain, and neither number alone is "the FPR".
//
// WHAT THIS VOCABULARY IS. Ordinary Latin-script given names and family names in
// common use in English-speaking countries. Nothing more. It is NOT a demographic
// sample, NOT drawn from any customer data, and NOT representative of the name
// distribution any particular institution screens — a bank with a South Asian or
// Arabic-speaking customer base would see far more token overlap with a sanctions
// list than this set produces, and therefore a higher rate. It is a control that
// isolates one variable: what the product does with a name it has no lexical
// reason to react to at all.
//
// Every generated name is filtered at build time against the corpus's own owner
// index and token index (see ./negatives), so a name that turns out to be on the
// list, or to share any whole token with any published name, is discarded rather
// than mislabelled as clean.

/** Given names. Ordinary, Latin-script, deliberately unremarkable. */
export const PLAIN_GIVEN_NAMES: readonly string[] = [
	"amelia",
	"benjamin",
	"charlotte",
	"daniel",
	"eleanor",
	"finnegan",
	"georgia",
	"harrison",
	"imogen",
	"jasper",
	"katherine",
	"lawrence",
	"matilda",
	"nathaniel",
	"olivia",
	"penelope",
	"quentin",
	"rosalind",
	"sebastian",
	"theodora",
	"ursula",
	"vincent",
	"wilhelmina",
	"xavier",
	"yolanda",
	"zachary",
	"abigail",
	"bartholomew",
	"clementine",
	"desmond",
	"evangeline",
	"frederick",
	"gwendolyn",
	"humphrey",
	"isadora",
	"jonathan",
	"katarina",
	"leopold",
	"marguerite",
	"nicodemus",
	"ottoline",
	"percival",
	"rosamund",
	"sylvester",
	"tabitha",
	"valentina",
	"winifred",
	"araminta",
	"cornelius",
	"delphine",
	"ezekiel",
	"florence",
	"gregory",
	"henrietta",
	"lysander",
	"millicent",
	"octavia",
	"peregrine",
	"seraphina",
	"thaddeus",
];

/** Family names. Same intent: common, and unremarkable. */
export const PLAIN_FAMILY_NAMES: readonly string[] = [
	"abernathy",
	"brightwater",
	"cavendish",
	"dunwoody",
	"ellingham",
	"fairweather",
	"gallagher",
	"hollingsworth",
	"inglethorpe",
	"jenkinson",
	"kirkpatrick",
	"livingstone",
	"mortimer",
	"nightingale",
	"oakhurst",
	"pennington",
	"quarrington",
	"ravensworth",
	"shackleton",
	"thornbury",
	"underhill",
	"vanderbilt",
	"wetherby",
	"yarborough",
	"ashworth",
	"blackwood",
	"carmichael",
	"delacroix",
	"etherington",
	"farnsworth",
	"godwinson",
	"hartfield",
	"illingworth",
	"jessamine",
	"kingsleigh",
	"lockhart",
	"marchbanks",
	"netherfield",
	"ottershaw",
	"pemberton",
	"quillfeather",
	"rutherglen",
	"summerfield",
	"tattersall",
	"upminster",
	"vexingham",
	"whitlocke",
	"yeoville",
	"applewhite",
	"barrowcliffe",
	"chetwynde",
	"drummondale",
	"eastleigh",
	"fotheringay",
	"grimsditch",
	"haversham",
	"kensworth",
	"loxbridge",
	"marlborough",
	"norrington",
	"pallister",
	"ravenscroft",
];
