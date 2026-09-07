/* ---------------------------------------------------------------------------
 * players.js -- a starting autocomplete pool for the upcoming draft.
 *
 * This is a convenience list, NOT an authoritative roster. It is combined at
 * runtime with every name that appears in history.js, and you can always type
 * a name that is not in either list -- nothing here restricts what you draft.
 *
 * If your league has an exported player list / ADP sheet, import it from the
 * Setup tab (CSV: name,pos[,team][,value]) and it will take precedence.
 *
 * Format: "POS|Full Name", one per line.
 * ------------------------------------------------------------------------- */
window.PLAYER_POOL_RAW = `
QB|Josh Allen
QB|Lamar Jackson
QB|Jalen Hurts
QB|Jayden Daniels
QB|Joe Burrow
QB|Patrick Mahomes
QB|Baker Mayfield
QB|Bo Nix
QB|Justin Herbert
QB|Brock Purdy
QB|Caleb Williams
QB|Drake Maye
QB|C.J. Stroud
QB|Kyler Murray
QB|Jordan Love
QB|Dak Prescott
QB|Trevor Lawrence
QB|Justin Fields
QB|J.J. McCarthy
QB|Michael Penix Jr.
QB|Cam Ward
QB|Jaxson Dart
QB|Tyler Shough
QB|Matthew Stafford
QB|Sam Darnold
QB|Geno Smith
QB|Bryce Young
QB|Anthony Richardson
QB|Aaron Rodgers
QB|Russell Wilson
QB|Daniel Jones
QB|Tua Tagovailoa
QB|Kirk Cousins
QB|Spencer Rattler
RB|Bijan Robinson
RB|Saquon Barkley
RB|Jahmyr Gibbs
RB|Ashton Jeanty
RB|Christian McCaffrey
RB|De'Von Achane
RB|Derrick Henry
RB|Josh Jacobs
RB|Bucky Irving
RB|Jonathan Taylor
RB|Chase Brown
RB|Kyren Williams
RB|James Cook
RB|Omarion Hampton
RB|Breece Hall
RB|Kenneth Walker III
RB|Alvin Kamara
RB|Chuba Hubbard
RB|James Conner
RB|TreVeyon Henderson
RB|Quinshon Judkins
RB|RJ Harvey
RB|Cam Skattebo
RB|Kaleb Johnson
RB|Tony Pollard
RB|David Montgomery
RB|Isiah Pacheco
RB|Aaron Jones
RB|Joe Mixon
RB|Travis Etienne Jr.
RB|Rhamondre Stevenson
RB|Brian Robinson Jr.
RB|Javonte Williams
RB|Najee Harris
RB|Tyrone Tracy Jr.
RB|Rachaad White
RB|Zach Charbonnet
RB|Jaylen Warren
RB|Tyjae Spears
RB|Blake Corum
RB|Braelon Allen
RB|Jerome Ford
RB|Nick Chubb
RB|Austin Ekeler
RB|J.K. Dobbins
RB|Zamir White
RB|Ray Davis
RB|Trey Benson
RB|Tank Bigsby
RB|Bhayshul Tuten
RB|Ollie Gordon II
RB|Dylan Sampson
RB|Devin Neal
RB|Trevor Etienne
RB|Jordan Mason
RB|Tyler Allgeier
RB|Rico Dowdle
RB|Roschon Johnson
RB|Isaac Guerendo
RB|Bam Knight
RB|Kendre Miller
RB|Jaydon Blue
RB|Woody Marks
RB|Kyle Monangai
WR|Ja'Marr Chase
WR|Justin Jefferson
WR|CeeDee Lamb
WR|Puka Nacua
WR|Malik Nabers
WR|Amon-Ra St. Brown
WR|Nico Collins
WR|Brian Thomas Jr.
WR|A.J. Brown
WR|Drake London
WR|Tyreek Hill
WR|Ladd McConkey
WR|Garrett Wilson
WR|Tee Higgins
WR|Marvin Harrison Jr.
WR|Davante Adams
WR|Mike Evans
WR|Terry McLaurin
WR|DK Metcalf
WR|Jaxon Smith-Njigba
WR|Rashee Rice
WR|Xavier Worthy
WR|Zay Flowers
WR|Courtland Sutton
WR|Jameson Williams
WR|Jerry Jeudy
WR|Jaylen Waddle
WR|DJ Moore
WR|Chris Olave
WR|Jordan Addison
WR|Khalil Shakir
WR|Rome Odunze
WR|Keon Coleman
WR|Ricky Pearsall
WR|Travis Hunter
WR|Tetairoa McMillan
WR|Emeka Egbuka
WR|Matthew Golden
WR|Luther Burden III
WR|Jayden Higgins
WR|Tre Harris
WR|Kyle Williams
WR|Jack Bech
WR|Deebo Samuel
WR|Cooper Kupp
WR|Calvin Ridley
WR|Chris Godwin
WR|Stefon Diggs
WR|Keenan Allen
WR|Amari Cooper
WR|Michael Pittman Jr.
WR|George Pickens
WR|Brandon Aiyuk
WR|Christian Watson
WR|Josh Downs
WR|Wan'Dale Robinson
WR|Darnell Mooney
WR|Rashid Shaheed
WR|Cedric Tillman
WR|Jalen McMillan
WR|Adonai Mitchell
WR|Xavier Legette
WR|Marvin Mims Jr.
WR|Quentin Johnston
WR|Romeo Doubs
WR|Dontayvion Wicks
WR|Alec Pierce
WR|Hollywood Brown
WR|Jakobi Meyers
WR|Tyler Lockett
WR|Elijah Moore
WR|Jauan Jennings
WR|Rashod Bateman
WR|Tank Dell
WR|Joshua Palmer
WR|Demario Douglas
TE|Brock Bowers
TE|Trey McBride
TE|George Kittle
TE|Sam LaPorta
TE|Travis Kelce
TE|Mark Andrews
TE|T.J. Hockenson
TE|David Njoku
TE|Evan Engram
TE|Dalton Kincaid
TE|Tucker Kraft
TE|Colston Loveland
TE|Tyler Warren
TE|Jake Ferguson
TE|Hunter Henry
TE|Isaiah Likely
TE|Dallas Goedert
TE|Zach Ertz
TE|Cade Otton
TE|Mike Gesicki
TE|Kyle Pitts
TE|Pat Freiermuth
TE|Jonnu Smith
TE|Chigoziem Okonkwo
TE|Brenton Strange
TE|Cole Kmet
TE|Dalton Schultz
TE|Noah Fant
TE|Ben Sinnott
TE|Mason Taylor
K|Brandon Aubrey
K|Cameron Dicker
K|Harrison Butker
K|Chris Boswell
K|Ka'imi Fairbairn
K|Jake Bates
K|Tyler Bass
K|Jason Sanders
K|Wil Lutz
K|Younghoe Koo
K|Evan McPherson
K|Jake Elliott
K|Matt Gay
K|Chase McLaughlin
K|Daniel Carlson
K|Tyler Loop
K|Cairo Santos
K|Joshua Karty
K|Blake Grupe
K|Nick Folk
K|Jason Myers
K|Chad Ryland
K|Will Reichard
K|Brandon McManus
DST|Arizona
DST|Atlanta
DST|Baltimore
DST|Buffalo
DST|Carolina
DST|Chicago
DST|Cincinnati
DST|Cleveland
DST|Dallas
DST|Denver
DST|Detroit
DST|Green Bay
DST|Houston
DST|Indianapolis
DST|Jacksonville
DST|Kansas City
DST|Las Vegas
DST|LA Chargers
DST|LA Rams
DST|Miami
DST|Minnesota
DST|New England
DST|New Orleans
DST|NY Giants
DST|NY Jets
DST|Philadelphia
DST|Pittsburgh
DST|San Francisco
DST|Seattle
DST|Tampa Bay
DST|Tennessee
DST|Washington
`;
