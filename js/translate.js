// Czech → English for product, deal and receipt names.
// 1. A translation saved by the daily job (DeepL, when a key is set up) is used when there is one.
// 2. Otherwise a grocery glossary translates word by word: phrases first, then whole words,
//    then word stems (so "kuřecí", "kuřecích" and "kuře" all become "chicken"). Brands, sizes and
//    anything unknown are kept as they are.
import { norm } from "./units.js";

// "czech words (no accents) = english". A trailing "*" makes it a stem that matches longer words.
const PHRASES = `
bez kosti=boneless
s kosti=bone-in
mlete maso=mince
mlete hovezi=beef mince
mlete veprove=pork mince
smetana ke slehani=whipping cream
smetana na vareni=cooking cream
zakysana smetana=sour cream
kysana smetana=sour cream
bily jogurt=plain yoghurt
recky jogurt=Greek yoghurt
taveny syr=processed cheese
cukr krupice=granulated sugar
cukr moucka=icing sugar
mouka hladka=plain flour
hladka mouka=plain flour
mouka polohruba=semi-coarse flour
polohruba mouka=semi-coarse flour
mouka hruba=coarse flour
salatova okurka=cucumber
okurka salatova=cucumber
okurky sterilovane=pickled gherkins
sterilovane okurky=pickled gherkins
kysane zeli=sauerkraut
cervene zeli=red cabbage
bile zeli=white cabbage
jarni cibulka=spring onion
cervena cibule=red onion
ledovy salat=iceberg lettuce
cherry rajcata=cherry tomatoes
rajcata cherry=cherry tomatoes
cervena repa=beetroot
zelene fazolky=green beans
vodni meloun=watermelon
paprika mleta=ground paprika
mleta paprika=ground paprika
hovezi vyvar=beef stock
kureci vyvar=chicken stock
cesnek granulovany=garlic granules
olivovy olej=olive oil
slunecnicovy olej=sunflower oil
repkovy olej=rapeseed oil
horka cokolada=dark chocolate
mlecna cokolada=milk chocolate
bila cokolada=white chocolate
zrnkova kava=coffee beans
mleta kava=ground coffee
instantni kava=instant coffee
mineralni voda=mineral water
pramenita voda=spring water
jemne perliva=lightly sparkling
svetly lezak=pale lager
tmavy lezak=dark lager
cervene vino=red wine
bile vino=white wine
ruzove vino=rosé wine
toaletni papir=toilet paper
kuchynske uterky=kitchen towels
papirove kapesniky=tissues
praci prasek=washing powder
praci gel=laundry gel
praci kapsle=laundry pods
prostredek na nadobi=washing-up liquid
tablety do mycky=dishwasher tablets
sprchovy gel=shower gel
tekute mydlo=liquid soap
zubni pasta=toothpaste
pytle na odpad=bin bags
pytle na odpadky=bin bags
vybrane druhy=selected varieties
ruzne druhy=assorted
ruzne prichute=assorted flavours
vybrane prichute=selected flavours
z volneho vybehu=free-range
podestylkove chovu=barn
na vahu=by weight
cena za=price per
prasek do peciva=baking powder
kypric prasek=baking powder
jedla soda=baking soda
vanilkovy cukr=vanilla sugar
ovesne vlocky=rolled oats
kukuricne lupinky=cornflakes
dzus 100=100% juice
ryze horka=Ryze Hořká
jogurt bily=plain yoghurt
nejvyssi jakosti=finest quality
bez laktozy=lactose-free
extra panensky=extra virgin
`;

const WORDS = `
kure=chicken
kurete=chicken
kureci*=chicken
kurec*=chicken
kuraci*=chicken
krut*=turkey
vepr*=pork
hovez*=beef
telec*=veal
jehnec*=lamb
kachn*=duck
husi*=goose
kralic*=rabbit
prsa=breast
prsni*=breast
prsicka=breast fillets
stehn*=thighs
stehen*=thigh
stehyn*=drumsticks
palicky=drumsticks
kridl*=wings
kridel=wings
rizky=schnitzels
rizek=schnitzel
rizk*=schnitzels
filet*=fillets
plat*=slices
kotlet*=chops
krkovic*=neck
plec*=shoulder
bucek=belly
buck*=belly
panenk*=tenderloin
kyta=leg
kyty=leg
svickov*=sirloin
rostenec=sirloin
rostence=sirloin
zebr*=ribs
jatr*=liver
srdc*=hearts
maso=meat
masa=meat
masov*=meat
mlet*=ground
gulas*=goulash
slanin*=bacon
sunk*=ham
salam*=salami
parky=frankfurters
parek=frankfurter
park*=frankfurters
klobas*=sausage
spekack*=sausages
uzen*=smoked
pecen*=roast
grilov*=grilling
marinov*=marinated
obalov*=breaded
chlazen*=chilled
mrazen*=frozen
cerstv*=fresh
losos*=salmon
tresk*=cod
tunak*=tuna
makrel*=mackerel
sled*=herring
pstruh*=trout
kapr*=carp
krevet*=prawns
ryb=fish
ryby=fish
rybi*=fish
rybiz*=currants
mlek*=milk
mlecn*=milk
polotucn*=semi-skimmed
plnotucn*=full-fat
odtucn*=skimmed
trvanliv*=long-life
masl*=butter
smetan*=cream
jogurt*=yoghurt
tvaroh*=quark
tvarohov*=quark
syr=cheese
syry=cheese
syr*=cheese
strouhan*=grated
platky=slices
plati=valid
vejce=eggs
vajec=eggs
vajic*=egg
kefir*=kefir
podmasli=buttermilk
zmrzlin*=ice cream
tuk=fat
tuku=fat
tucn*=fat
rajc*=tomatoes
okurk*=cucumber
paprik*=peppers
cibul*=onions
cesnek*=garlic
cesnak*=garlic
brambor*=potatoes
pozdn*=late
ran=early
mrkev=carrots
mrkv*=carrots
celer*=celery
petrzel*=parsley
zeli=cabbage
kvetak*=cauliflower
brokolic*=broccoli
spenat*=spinach
salat*=lettuce
rukol*=rocket
cuket*=courgettes
lilek=aubergine
lilk*=aubergine
dyne=pumpkin
dyn*=pumpkin
houb*=mushrooms
zampion*=mushrooms
porek=leek
pork*=leek
redkvic*=radishes
repa=beetroot
kukuric*=corn
hrasek=peas
hrask*=peas
fazol*=beans
cizrn*=chickpeas
cock*=lentils
jablk*=apples
jablek=apples
jablecn*=apple
hrusk*=pears
banan*=bananas
pomeranc*=oranges
mandarink*=mandarins
klementink*=clementines
citron*=lemons
limetk*=limes
hrozn*=grapes
jahod*=strawberries
malin*=raspberries
boruvk*=blueberries
tresn*=cherries
visn*=sour cherries
svestk*=plums
merunk*=apricots
brosk*=peaches
nektarink*=nectarines
ananas*=pineapple
meloun*=melon
avokad*=avocado
ovoc*=fruit
zelenin*=vegetables
bylink*=herbs
bazalk*=basil
koriandr*=coriander
kopr*=dill
pazitk*=chives
mata=mint
zazvor*=ginger
chleb=bread
chleba=bread
chleb*=bread
rohlik*=rolls
housk*=buns
baget*=baguette
toust*=toast
celozrn*=wholegrain
zitn*=rye
psenic*=wheat
kvask*=sourdough
kolac*=cake
buchta=bun
buchty=buns
koblih*=doughnut
pecivo=bread rolls
vanock*=sweet plaited bread
ryze=rice
ryz*=rice
testovin*=pasta
spaget*=spaghetti
nudl*=noodles
mouk*=flour
hladk*=plain
cukr=sugar
cukru=sugar
trtin*=cane
sul=salt
soli=salt
pepr=pepper
olej*=oil
ocet=vinegar
octa=vinegar
med=honey
medu=honey
dzem*=jam
marmelad*=marmalade
kecup*=ketchup
horcic*=mustard
majonez*=mayonnaise
omack*=sauce
polevk*=soup
bujon*=stock cubes
konzerv*=canned
steriliz*=pickled
sterilov*=pickled
nakladan*=pickled
drcen*=crushed
loupan*=peeled
protlak*=purée
kokos*=coconut
arasid*=peanut
mandl*=almonds
orech*=nuts
orisk*=nuts
vlass*=walnut
liskov*=hazelnut
kesu=cashews
rozink*=raisins
vlock*=flakes
ovesn*=oat
musli=muesli
cokolad*=chocolate
horka=bitter
hork*=bitter
kakao*=cocoa
kava=coffee
kavy=coffee
kav*=coffee
caj=tea
caje=tea
caj*=tea
susenk*=biscuits
oplatk*=wafers
bonbon*=sweets
chipsy=crisps
lupink*=crisps
tycink*=bars
slan*=salted
sladk*=sweet
prasek=powder
drozd*=yeast
vanilk*=vanilla
skoric*=cinnamon
koreni=spices
kmin=caraway
oregan*=oregano
voda=water
vody=water
mineral*=mineral
perliv*=sparkling
neperliv*=still
dzus*=juice
stava=juice
limonad*=lemonade
napoj*=drink
pivo=beer
piva=beer
pivni*=beer
lezak*=lager
svetl*=pale
tmav*=dark
nealko*=alcohol-free
vino=wine
vina=wine
cerven*=red
bil=white
bile=white
bila=white
bily=white
ruzov*=rosé
such*=dry
polosuch*=semi-dry
sekt=sparkling wine
sampon*=shampoo
mydl*=soap
avivaz*=fabric softener
cistic*=cleaner
houbick*=sponges
baleni=pack
balicek=pack
ks=pcs
kus=piece
kusy=pieces
druhy=varieties
druh=variety
prichut*=flavour
prichute=flavours
s=with
se=with
bez=without
a=and
na=for
do=for
pro=for
z=from
ze=from
v=in
ve=in
bio=organic
velk*=large
mal=small
male=small
mala=small
maly=small
volne=loose
volny=loose
volna=loose
vazen*=by weight
cca=approx.
smes=mix
smes*=mix
plnen*=filled
ochucen*=flavoured
prirodn*=natural
domac*=homemade
farmar*=farmhouse
selsk*=farmhouse
tradicn*=traditional
jemn*=fine
klasick*=classic
cesk*=Czech
moravsk*=Moravian
jihocesk*=South Bohemian
italsk*=Italian
recky=Greek
reck*=Greek
lehk*=light
horni=upper
dolni=lower
prepust*=clarified
nejvyss*=finest
jakost*=quality
vyberov*=select
panensk*=virgin
listov*=leaf
tvrd*=hard
mekk*=soft
zral*=ripe
mlad*=young
susen*=dried
solen*=salted
nesolen*=unsalted
korenov*=root
krajen*=sliced
platkov*=sliced
cel=whole
cele=whole
cely=whole
cela=whole
kostk*=cubes
nudlick*=strips
bezlepk*=gluten-free
nizkotucn*=low-fat
protein*=protein
detsk*=kids'
ovocn*=fruit
kminov*=caraway
vrstv*=-ply
konzumn*=
uzenin*=smoked meats
zlut*=yellow
zelen*=green
modr*=blue
oranzov*=orange
fialov*=purple
cern*=black
hned*=brown
`;

const PH = new Map(), EX = new Map(), ST = [];
for (const l of PHRASES.trim().split("\n")) { const [k, v] = l.split("="); PH.set(k.trim(), v.trim()); }
for (const l of WORDS.trim().split("\n")) {
  const [k, v] = l.split("="); const key = k.trim();
  if (key.endsWith("*")) ST.push([key.slice(0, -1), v.trim()]); else EX.set(key, v.trim());
}
ST.sort((a, b) => b[0].length - a[0].length);
const PH_MAX = Math.max(...[...PH.keys()].map(k => k.split(" ").length));

let SAVED = {};
/** Translations saved by the daily job: {"Czech name": "English name"} */
export function useSaved(map) { SAVED = map || {}; }

function wordEn(n) {
  if (EX.has(n)) return EX.get(n);
  for (const [s, v] of ST) if (n.length >= s.length && n.startsWith(s)) return v;
  return null;
}

/** Word-by-word glossary translation. */
export function glossary(text) {
  const src = String(text || "");
  // split into word and non-word pieces, keeping everything
  const parts = src.match(/[\p{L}]+|[^\p{L}]+/gu) || [];
  const idx = []; parts.forEach((p, i) => { if (/\p{L}/u.test(p)) idx.push(i); });
  const out = parts.slice();
  let hits = 0;
  for (let w = 0; w < idx.length; w++) {
    let done = false;
    for (let len = Math.min(PH_MAX, idx.length - w); len >= 2 && !done; len--) {
      const span = idx.slice(w, w + len);
      // only join words separated by plain spaces
      if (span.some((pi, k) => k > 0 && !/^\s+$/.test(parts[pi - 1]))) continue;
      const key = span.map(pi => norm(parts[pi])).join(" ");
      if (PH.has(key)) {
        out[span[0]] = PH.get(key); for (let k = 1; k < span.length; k++) { out[span[k]] = ""; out[span[k] - 1] = ""; }
        hits += len; w += len - 1; done = true;
      }
    }
    if (done) continue;
    const pi = idx[w], raw = parts[pi], n = norm(raw);
    // unknown words (brands, product lines) stay as they are; all-caps words are treated as brands
    const en = raw.length > 2 && raw === raw.toUpperCase() ? null : wordEn(n);
    if (en != null) { out[pi] = en; hits++; }
  }
  let s = out.join("").replace(/\s{2,}/g, " ").trim();
  s = s.replace(/\b(with|for|from|in|and)\s*$/i, "").trim();
  return { text: s ? s.charAt(0).toUpperCase() + s.slice(1) : src, hits };
}

/** Best English name for a Czech product name. */
export function en(text) {
  if (!text) return "";
  const k = String(text).trim();
  if (SAVED[k]) return SAVED[k];
  const g = glossary(k);
  return g.hits ? g.text : k;
}
/** True when the English name differs from the Czech one (worth showing both). */
export const differs = (cz, e) => norm(cz) !== norm(e);
