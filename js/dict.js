// Ingredient dictionary: English and Czech names → one canonical item each.
// Shared by the app and the price-fetch job.
//
// Row format (pipe separated):
//   id | English names (;) | Czech match stems (;) | Tesco search | exclude stems (,) | category | unit | typical pack | extras
// Czech match stems: each alternative is a set of word prefixes that must all appear, in any order
//   ("kureci prs" matches "Kuřecí prsní řízky"). A stem ending in "=" must be the whole word ("med=").
// unit: g (sold by weight), ml (by volume) or ks (by the piece). typical pack is in that unit.
// extras: d=grams per ml (for cups/spoons), e=grams per piece (for "2 onions"), l=1 sold loose,
//   p=1 pantry staple (usually at home), s=cheaper swap ids (,)

import { norm } from "./units.js";

export const CATS = [
  ["produce", "Fruit & veg"], ["bakery", "Bakery"], ["meat", "Meat & fish"], ["deli", "Deli & cold cuts"],
  ["dairy", "Dairy & eggs"], ["frozen", "Frozen"], ["pantry", "Pantry"], ["snacks", "Snacks & sweets"],
  ["drinks", "Drinks"], ["household", "Household"], ["other", "Other"],
];
export const CAT_NAME = Object.fromEntries(CATS);
export const CAT_ORDER = Object.fromEntries(CATS.map(([k], i) => [k, i]));

/** kupi.cz category slug → our category */
export const KUPI_CATS = {
  "ovoce-a-zelenina": "produce", "pecivo": "bakery", "maso-drubez-a-ryby": "meat", "lahudky": "deli",
  "mlecne-vyrobky-a-vejce": "dairy", "mrazene-a-instantni-potraviny": "frozen", "konzervy": "pantry",
  "vareni-a-peceni": "pantry", "zdrava-vyziva": "pantry", "sladkosti-a-slane-snacky": "snacks",
  "nealko-napoje": "drinks", "alkohol": "drinks", "drogerie": "household", "domacnost": "household",
};

const SWEET = "jahod,brosk,vanil,cokol,ovoc,boruv,malin,visn,kokos,strac,lesn,karamel,meru,mango,napoj,pitn,muesli,cerea,tycin";
const BERRY_EXC = "dzem,jogurt,mrazen,sirup,cokol,susen,caj,zmrzlin,dort,limonad,mlek,aroma,pyre,detsk,napoj,tycin,musli,muesli";
const MEAT_EXC = "sunk,salam,uzen,nugget,strips,obal,kebab,sendvic,salat,wrap,pecen,plnen,pastik,polevk,vyvar,bujon,granul,kapsick,konzerv,pes,psi,kocic";

const ROWS = `
onion|onion;onions;brown onion;yellow onion;white onion|cibul|cibule|jarni,cerven,smazen,susen,chips,krouz,prasek,nakladan,granul,omack,pomazank,polevk|produce|g|1000|e=150,l=1
red-onion|red onion;red onions;spanish onion|cervena cibul;cibule cervena|červená cibule|smazen,nakladan,chips|produce|g|500|e=150,l=1,s=onion
spring-onion|spring onion;spring onions;scallion;scallions;green onion;green onions|jarni cibul|jarní cibulka|smazen|produce|ks|1|
garlic|garlic;garlic clove;garlic cloves;cloves garlic;clove garlic;clove of garlic;cloves of garlic|cesnek;cesnak|česnek|medvedi,granul,susen,prasek,past,nakladan,olej,dresink,omack,masl,baget,chleb,pecivo,krem,chips,bylink|produce|g|100|e=5,l=1
ginger|ginger;fresh ginger;ginger root;root ginger|zazvor|zázvor|nakladan,caj,limonad,sirup,susen,mlet,prasek,cuk,shot,pivo,napoj|produce|g|100|l=1
potato|potato;potatoes;floury potatoes;waxy potatoes;baby potatoes;new potatoes|brambor|brambory|chips,hranolk,kase,lupin,knedl,salat,plack,kroket,sladk,steril,mrazen,gnocchi,noky,mouk,skrob,polevk|produce|g|2000|e=150,l=1
sweet-potato|sweet potato;sweet potatoes;kumara|batat;sladke brambor|batáty|chips,hranolk|produce|g|1000|e=300,l=1,s=potato
carrot|carrot;carrots|mrkev;mrkv|mrkev|stav,dzus,salat,detsk,kase,susen,dort,krem,mrazen|produce|g|1000|e=80,l=1
celery|celery;celery stalk;celery stalks;celery sticks|celer rapik;rapikat celer;rapikovy celer|řapíkatý celer|sul|produce|ks|1|
celeriac|celeriac;celery root|celer bulv;bulvovy celer;celer|celer bulvový|rapik,sul,salat|produce|g|600|l=1
parsnip|parsnip;parsnips|pastinak|pastinák||produce|g|500|l=1
parsley-root|parsley root|petrzel koren;korenova petrzel|petržel kořenová|nat,list,susen|produce|g|500|l=1
parsley|parsley;flat-leaf parsley;flat leaf parsley;fresh parsley;italian parsley|petrzel nat;petrzelka;petrzelova nat;petrzel|petrželka|koren,susen,mrazen|produce|ks|1|
coriander|coriander;cilantro;fresh coriander;coriander leaves|koriandr|koriandr|mlet,semin,cel,kuli,susen|produce|ks|1|
basil|basil;fresh basil;basil leaves|bazalk|bazalka|susen,pesto,omack,mrazen|produce|ks|1|
dill|dill;fresh dill|kopr|kopr|omack,susen,okurk|produce|ks|1|
chives|chives|pazitk|pažitka|susen,syr,pomazank|produce|ks|1|
mint|mint;fresh mint;mint leaves|mata=;maty=|máta|caj,zvykac,bonbon,cokol,sirup,peprn|produce|ks|1|
lemon|lemon;lemons;lemon juice;lemon zest;juice of 1 lemon|citron|citrony|caj,limonad,sirup,dzus,tycin,ocet,susen,dort,trav,kyselin,aroma,pivo,napoj,voda,koncentr|produce|g|500|e=120,l=1
lime|lime;limes;lime juice;lime zest|limetk|limetky|sirup,limonad,caj,list,napoj|produce|g|250|e=70,l=1
orange|orange;oranges|pomeranc|pomeranče|dzus,dzem,caj,limonad,cokol,kur,susen,dort,sirup,napoj,aroma|produce|g|1000|e=200,l=1
apple|apple;apples;green apple;red apple|jablk;jablek|jablka|dzus,most,ocet,kase,susen,chips,stru,tycin,pyre,detsk,kolac,lupin,kvas,napoj,caj,cider|produce|g|1000|e=180,l=1
banana|banana;bananas|banan|banány|chips,susen,cokol,mlek,jogurt,detsk,pyre,tycin,napoj|produce|g|1000|e=120,l=1
pear|pear;pears|hrusk|hrušky|kompot,dzus,pyre,detsk|produce|g|1000|e=180,l=1
grapes|grapes|hrozn|hroznové víno|dzus,most,olej,cukr,rozink|produce|g|500|l=1
strawberries|strawberries;strawberry|jahod|jahody|${BERRY_EXC}|produce|g|500|l=1
blueberries|blueberries;blueberry|boruvk|borůvky|${BERRY_EXC}|produce|g|125|
raspberries|raspberries;raspberry|malin|maliny|${BERRY_EXC}|produce|g|125|
avocado|avocado;avocados|avokad|avokádo|olej,pomazank,guacamol,krem|produce|ks|1|e=200
tomato|tomato;tomatoes;fresh tomatoes;ripe tomatoes;roma tomatoes|rajc|rajčata|cherry,koktejl,susen,protlak,pasat,kecup,omack,polevk,dzus,konzerv,loupan,drcen,steril,salat,pyre,plech,krajen,sekan,chips,past|produce|g|1000|e=100,l=1
cherry-tomatoes|cherry tomatoes;cherry tomato;grape tomatoes|cherry rajc;rajc cherry;koktejl rajc|cherry rajčata|susen,omack,konzerv|produce|g|250|s=tomato
cucumber|cucumber;cucumbers;english cucumber;telegraph cucumber;lebanese cucumber|okurk salat;salat okurk;hadovk;okurk|okurka salátová|kysel,steril,nakladan,cornichon,znojm,chips,sterilov|produce|ks|1|e=350
bell-pepper|capsicum;capsicums;bell pepper;bell peppers;red pepper;red peppers;green pepper;yellow pepper;red capsicum|paprik|paprika|mlet,uzen,chips,pomazank,omack,kecup,salam,klobas,steril,nakladan,plnen,ajvar,past,koren,prasek,chill,lupin,krem,polevk|produce|g|500|e=150,l=1
chilli|chilli;chili;red chilli;chillies;chilies;chile;jalapeno;jalapenos;bird's eye chilli|chilli;chili;feferonk|chilli papričky|omack,sos,kecup,prasek,mlet,vlock,nakladan,olej,cokol,chips,carne,fazol,past,koren,susen,maso,salam,klobas|produce|g|50|
zucchini|zucchini;courgette;courgettes;zucchinis|cuket|cukety|nakladan|produce|g|500|e=250,l=1
eggplant|eggplant;aubergine;aubergines;eggplants|lilek;baklazan|lilek|nakladan,pomazank,krem|produce|g|500|e=300,l=1
broccoli|broccoli;broccoli florets|brokolic|brokolice|mrazen,polevk,krem|produce|g|500|e=400,l=1,s=frozen-broccoli
frozen-broccoli|frozen broccoli|brokolic mrazen|brokolice mražená||frozen|g|450|
cauliflower|cauliflower;cauliflower florets|kvetak;karfiol|květák|mrazen,polevk,krem|produce|ks|1|e=800
spinach|spinach;baby spinach;fresh spinach;spinach leaves|spenat|špenát|mrazen,protlak,krem,pyre,past,nudl,tortil,knedl,kase,lasagn|produce|g|125|s=frozen-spinach
frozen-spinach|frozen spinach|spenat mrazen;spenat protlak;spenat listov mrazen|špenát mražený||frozen|g|450|
lettuce|lettuce;iceberg lettuce;cos lettuce;romaine;romaine lettuce;butter lettuce|ledov salat;salat ledov;hlavkov salat;salat hlavkov;salat roman;roman salat|ledový salát|dresink,zalivk|produce|ks|1|
salad-leaves|salad leaves;mixed salad;salad mix;mixed leaves;rocket;arugula;baby salad|rukol;salat smes;smes salat;salat mix;mix salat|rukola|dresink,zalivk|produce|g|125|
cabbage|cabbage;white cabbage;green cabbage|zeli|zelí bílé|kysan,steril,cerven,salat,cinsk,pekin,kapust,konzerv|produce|g|1000|l=1
red-cabbage|red cabbage;purple cabbage|cerven zeli;zeli cerven|zelí červené|kysan,steril|produce|g|1000|l=1
mushrooms|mushrooms;button mushrooms;champignons;mushroom;brown mushrooms;cremini mushrooms|zampion;houb|žampiony|steril,konzerv,susen,omack,polevk,krem,pizza,nakladan,smes,rizot|produce|g|250|
peas|peas;frozen peas;green peas;garden peas|hrasek|hrášek|steril,konzerv,wasabi,chips,snack,lusk,polevk|frozen|g|450|
corn|corn;sweetcorn;sweet corn;corn kernels;canned corn|kukuric|kukuřice sterilovaná|popcorn,chips,lupin,vlock,krup,mouk,skrob,olej,tycin,polent,tortil,krekr,klas,smes|pantry|g|340|
pumpkin|pumpkin;butternut squash;squash;butternut pumpkin;hokkaido|dyne;hokkaid|dýně|semin,olej,polevk,krem,pyre|produce|g|1000|l=1
leek|leek;leeks|porek;porr|pórek|polevk,susen|produce|ks|1|e=200
beetroot|beetroot;beets;beet|cervena repa;repa cerven;repa|červená řepa|cukr,steril,nakladan,stav,chips,dzus,salat|produce|g|500|l=1
radish|radish;radishes|redkvic;redkev|ředkvičky||produce|ks|1|
asparagus|asparagus;asparagus spears|chrest|chřest|steril,polevk,krem,konzerv|produce|g|250|
green-beans|green beans;string beans;french beans|zelene fazol;fazol lusk;fazolk|zelené fazolky|steril,konzerv|frozen|g|450|
mixed-veg|frozen vegetables;mixed vegetables;frozen veg;stir fry vegetables|zelenin smes;smes zelenin;zelenin mrazen|zeleninová směs|polevk,salat|frozen|g|450|
frozen-berries|frozen berries;mixed berries|mrazen ovoc;lesn ovoc mrazen;ovoc smes mrazen|mražené ovoce|jogurt,zmrzlin|frozen|g|300|
fries|frozen chips;fries;french fries;oven chips;potato wedges|hranolk|hranolky||frozen|g|750|
ice-cream|ice cream|zmrzlin|zmrzlina|kornout,poleva|frozen|ml|900|
bread|bread;loaf;white bread;sliced bread;wholemeal bread;rye bread;sourdough;loaf of bread|chleb=;chleba=;chleb;chlebova;chleba|chléb|chlebic,krekr,krehk,kvas,toust,strouhank,tycin,pomazank|bakery|g|1000|
toast-bread|toast bread;sandwich bread;toast;toasting bread|toust|toustový chléb|syr,sunk,salam,maslo,pomazank|bakery|g|500|s=bread
rolls|bread rolls;bread roll;rolls;roll;burger buns;buns;hot dog buns|rohlik;houst;bulk|rohlík|bramb,chips,parek,sunk,salam,syr,plnen,sladk,kakao|bakery|ks|1|e=43
baguette|baguette;french stick;french bread|baget|bageta|sunk,syr,salam,plnen,sendvic|bakery|ks|1|
tortillas|tortilla;tortillas;wraps;tortilla wraps;flour tortillas|tortil;wrap=|tortilla|chips,lupin,nachos,kure,sendvic,plnen|bakery|ks|6|
pita|pita;pita bread;pitta;flatbread|pita;pitta;pit chleb|pita|chips,plnen,gyros,kebab|bakery|ks|4|
breadcrumbs|breadcrumbs;panko;dried breadcrumbs|strouhank;panko|strouhanka||pantry|g|500|d=0.45
dumplings|bread dumplings;czech dumplings;knedliky|knedlik|houskový knedlík|ovocn,jahod,svestk,meru,tvaroh,merunk,bramb,borovk,mrazen ovoc|bakery|g|400|
chicken-breast|chicken breast;chicken breasts;chicken breast fillets;chicken fillet;chicken fillets;chicken;skinless chicken breast|kureci prs;kure prs;kureci rizk;kureci filet;prsni rizk;kureci prsni|kuřecí prsa|${MEAT_EXC}|meat|g|500|s=chicken-thigh
chicken-thigh|chicken thighs;chicken thigh;boneless chicken thighs;chicken thigh fillets;chicken leg;chicken legs;drumsticks;chicken drumsticks|kureci steh;kure steh;stehen rizk;kureci horn steh;kureci palick;kureci cvrtk|kuřecí stehna|${MEAT_EXC}|meat|g|1000|
chicken-whole|whole chicken;roasting chicken;whole roast chicken|kure cel;cele kure;kure chlazen;kure bez drob;kure kurat|kuře celé|${MEAT_EXC},prs,stehn,kridl,rizk,mlet,jatr|meat|g|1500|l=1
chicken-wings|chicken wings;wings;chicken wing|kureci kridl;kridel;kridla|kuřecí křídla|${MEAT_EXC}|meat|g|1000|
beef-mince|beef mince;minced beef;ground beef;mince;lean beef mince;beef mincemeat|hovezi mlet;mlete hovezi|hovězí mleté maso|vepr,mix,smes,kure,krut,${MEAT_EXC}|meat|g|500|s=mixed-mince
mixed-mince|mixed mince;pork and beef mince;minced meat;ground meat|mlete maso;mlete mix;mlete smes;mlete vepr hovezi;mlete hovezi vepr|mleté maso mix|krut,kure,${MEAT_EXC}|meat|g|500|
pork-mince|pork mince;minced pork;ground pork|vepr mlet;mlete vepr|vepřové mleté maso|hovez,krut,kure,${MEAT_EXC}|meat|g|500|
turkey-mince|turkey mince;ground turkey;minced turkey|krut mlet;mlete krut|krůtí mleté maso|${MEAT_EXC}|meat|g|500|
pork-shoulder|pork shoulder;pork neck;pork collar;pork butt;pork scotch fillet|vepr plec;vepr krkovic;krkovic|vepřová krkovice|uzen,salam,${MEAT_EXC}|meat|g|1000|
pork-loin|pork chops;pork loin;pork chop;pork cutlets;pork tenderloin;pork fillet|vepr kotlet;vepr pecen;vepr panenk;panenk|vepřová kotleta|${MEAT_EXC}|meat|g|500|
pork-belly|pork belly|vepr bok;bucek|vepřový bůček|uzen,salam,${MEAT_EXC}|meat|g|1000|
beef-steak|beef steak;steak;steaks;sirloin;rump steak;ribeye;scotch fillet;porterhouse|hovezi steak;steak hovezi;rostenec;svickov;hovezi rostbif|hovězí steak|omack,koren,krut,vepr,kure,tunak,losos,ryb|meat|g|300|
beef-stew|stewing beef;beef chuck;braising beef;beef for stew;gravy beef;diced beef;beef shin|hovezi pliz;hovezi kyt;hovezi gulas;hovezi predni;hovezi na gulas;hovezi kostk|hovězí kýta|konzerv,polevk,hotov|meat|g|1000|
lamb|lamb;lamb leg;lamb shoulder;lamb chops;lamb mince|jehnec|jehněčí maso||meat|g|500|
salmon|salmon;salmon fillet;salmon fillets;fresh salmon|losos|losos|uzen,pomazank,sushi,konzerv,salat,sendvic,kaviar,pastik,granul,kapsick|meat|g|250|
smoked-salmon|smoked salmon;lox|uzen losos;losos uzen|uzený losos||deli|g|100|
white-fish|white fish;cod;hake;pollock;tilapia;basa;pangasius;fish fillets;fish fillet|treska;tresky;pangas;tilapi;morska stik;merluz;rybi filet|treska filety|tycin,obal,salat,pomazank,jatr,konzerv,olej|frozen|g|400|
tuna|tuna;canned tuna;tinned tuna;tuna chunks;tuna in oil;tuna in springwater|tunak|tuňák|salat,pomazank,sendvic,steak,sushi,pizza,pastik|pantry|g|160|
prawns|prawns;shrimp;shrimps;king prawns|krevet|krevety|chips,krekr,salat,sushi,omack|frozen|g|200|
bacon|bacon;streaky bacon;pancetta;bacon rashers;speck|slanin;bacon;pancett|slanina|chips,lupin,omack,susen,knedl,pomazank|deli|g|100|
ham|ham;sliced ham;ham slices;smoked ham|sunk|šunka|syr,pizza,sendvic,baget,toust,rizk,salat,chlebic,pomazank,omack,rohlik,knedl,peciv,croissant,tycin|deli|g|100|
salami|salami;chorizo;pepperoni|salam;choriz;pepperon|salám|pizza,sendvic,baget,chips,rohlik|deli|g|100|
sausages|sausages;frankfurters;hot dogs;bratwurst;kielbasa;kabanos|parky;parek;klobas;spekack;vursty;kabanos|párky|rohlik,hot dog,pecivo,kaps|deli|g|300|
eggs|eggs;egg;large eggs;free-range eggs;free range eggs;egg yolks;egg whites;egg yolk|vejce;vajic|vejce|cokol,kinder,nudl,testovin,salat,pomazank,krepel,likér,liker,velikonoc|dairy|ks|10|e=55
milk|milk;whole milk;full-cream milk;full cream milk;semi-skimmed milk;skim milk;skimmed milk;low-fat milk|mlek|mléko|kokos,mandl,oves,soj,ryz,kondenz,zahust,susen,cokol,kakao,ochuc,jogurt,kefir,podmasl,kysan,detsk,pocatec,kojen,tycin,kava,latte,dort,mlecn,rostlin,napoj,kase,koz,sprch,tel,plet|dairy|ml|1000|d=1.03
plant-milk|oat milk;almond milk;soy milk;soya milk;plant milk;rice milk|ovesn napoj;mandl napoj;soj napoj;ovesne mlek;rostlin napoj;ryz napoj|ovesný nápoj|cokol,kakao,kava|dairy|ml|1000|d=1.03
cream|cream;thickened cream;heavy cream;double cream;whipping cream;thick cream;pouring cream;cooking cream;single cream|smetan;slehack|smetana ke šlehání|kysel,zakys,syr,zmrzlin,dort,omack,susen,jogurt,cokol,polevk,kava,likér,liker,mascarpon|dairy|ml|250|d=1
sour-cream|sour cream;soured cream;creme fraiche;crème fraîche|zakysan smetan;kysel smetan;creme fraiche|zakysaná smetana|omack,dresink,chips|dairy|g|200|
yoghurt|yoghurt;yogurt;plain yoghurt;greek yoghurt;natural yoghurt;greek yogurt;natural yogurt;plain yogurt|jogurt|bílý jogurt|${SWEET}|dairy|g|500|d=1.05
butter|butter;unsalted butter;salted butter;butter, softened;softened butter;melted butter|masl|máslo|prepust,pomazank,croissant,prichut,susen,arasid,kakao,bylink,rostlin,sleh,ghi,bambuck,tel,kokos,mandl,cesnek,popcorn,keks,tycin,rama,flora,krem|dairy|g|250|d=0.96
margarine|margarine;spread;baking margarine|margarin;rostlin tuk;flora=;rama=;hera=|rama|susen|dairy|g|250|d=0.96,s=butter
cheddar|cheddar;cheddar cheese;tasty cheese;grated cheese;cheese;shredded cheese|cedar;cheddar|cheddar|chips,krekr,omack,sendvic,burger,tycin|dairy|g|200|s=eidam
eidam|edam;gouda;sliced cheese;eidam;cheese slices;emmental|eidam;edam;gouda;ementál;emental|eidam|chips,krekr,sendvic,baget,pizza,toust|dairy|g|100|
mozzarella|mozzarella;fresh mozzarella;buffalo mozzarella|mozzarell|mozzarella|pizza,sendvic,salat,tycin,obal|dairy|g|125|
parmesan|parmesan;parmigiano;parmigiano reggiano;grana padano;pecorino;parmesan cheese|parmez;parmigian;grana padan;pecorin|parmezán|omack,pesto,chips,krekr|dairy|g|100|
feta|feta;feta cheese;balkan cheese|feta;balkan syr;salatovy syr|feta|pizza,pomazank,salat smes|dairy|g|200|
halloumi|halloumi;haloumi;grilling cheese|halloum;grilovac syr;syr na gril|halloumi||dairy|g|200|
cream-cheese|cream cheese;philadelphia;soft cheese|smetan syr;philadelph;lucin;cream chees|smetanový sýr|dort,jogurt|dairy|g|150|
ricotta|ricotta|ricott|ricotta||dairy|g|250|
mascarpone|mascarpone|mascarpon|mascarpone|dort,dezert|dairy|g|250|
quark|quark;cottage cheese;curd cheese;tvaroh|tvaroh;cottage|tvaroh|dezert,dort,kolac,buch,knedl,tycin,jahod,vanil,ovoc,pomazank,susen|dairy|g|250|
tofu|tofu;firm tofu;silken tofu|tofu|tofu||dairy|g|180|
hummus|hummus;houmous|hummus;humus|hummus|chips|deli|g|200|
rice|rice;white rice;long grain rice;jasmine rice;basmati rice;basmati;arborio rice;risotto rice;brown rice|ryz;ryze;basmati;jasmin|rýže|chips,chleb,krekr,mouk,nudl,napoj,mlek,ocet,papir,pudink,kase,vlock,burizon,oplatk,susen,sake,arancin,salat,hotov,polevk,tycin|pantry|g|1000|d=0.85
pasta|pasta;spaghetti;penne;fusilli;macaroni;linguine;fettuccine;rigatoni;farfalle;tagliatelle;dried pasta;spaghettini|testovin;spaget;penne;fusill;makaron;kolink;vreten;tagliatel;fettucc;linguin;farfall;rigaton|těstoviny|salat,hotov,omack,polevk,mrazen,konzerv,lasagn,boloň,bolon|pantry|g|500|
lasagne-sheets|lasagne sheets;lasagna sheets;lasagne;lasagna noodles|lasagn|lasagne plátky|hotov,mrazen,omack|pantry|g|500|
noodles|noodles;egg noodles;rice noodles;ramen noodles;udon;soba|nudl;ramen;udon|nudle|polevk,hotov,kure,vyvar|pantry|g|250|
couscous|couscous|kuskus|kuskus|hotov,salat|pantry|g|500|d=0.75
gnocchi|gnocchi|gnocchi;noky|gnocchi||pantry|g|500|
oats|oats;rolled oats;porridge oats;oatmeal;quick oats|ovesn vlock;vlock oves|ovesné vločky|kase,tycin,susen,napoj,mlek,jogurt,granol|pantry|g|500|d=0.4
cereal|cereal;cornflakes;muesli;granola;breakfast cereal|muesli;musli;cornflak;cerealie;granol|müsli|tycin,jogurt|pantry|g|500|
flour|flour;plain flour;all-purpose flour;all purpose flour;self-raising flour;bread flour;wholemeal flour|mouk|mouka|kukur,ryz,pohank,kokos,mandl,cizrn,bramb,ovesn,cokol,skrob,dort,smes na|pantry|g|1000|d=0.53
cornflour|cornflour;cornstarch;corn starch;corn flour|kukuric skrob;skrob;solamyl;maizen|kukuřičný škrob||pantry|g|200|d=0.6
sugar|sugar;white sugar;caster sugar;granulated sugar;castor sugar|cukr|cukr krupice|cukrov,cukrar,vanil,mouck,trtin,kokos,hrozn,ovoc,polev,bez cukr,palm,sirup,zelen|pantry|g|1000|d=0.85
brown-sugar|brown sugar;light brown sugar;dark brown sugar;demerara|trtin cukr;cukr trtin;hned cukr|třtinový cukr||pantry|g|500|d=0.8
icing-sugar|icing sugar;powdered sugar;confectioners sugar;confectioners' sugar|mouck cukr;cukr mouck|cukr moučka||pantry|g|500|d=0.5
honey|honey|med=;medu=;medem=|med|pernik,medvid,medov,medail|pantry|g|500|d=1.4
olive-oil|olive oil;extra virgin olive oil;extra-virgin olive oil;evoo;light olive oil|olivov olej;olej olivov|olivový olej|tunak,sardin,makrel,rajc,artycok,feta,syr,chips,sprej|pantry|ml|500|d=0.92
oil|vegetable oil;sunflower oil;canola oil;rapeseed oil;oil;cooking oil;neutral oil;frying oil|slunecnic olej;olej slunecnic;repkov olej;olej repkov;rostlin olej|slunečnicový olej|tunak,sardin,makrel,chips,margarin,semin|pantry|ml|1000|d=0.92
vinegar|vinegar;white vinegar;apple cider vinegar;wine vinegar;cider vinegar;rice vinegar|ocet|ocet|balzam,okurk,feferon,zelí,zeli,rajc|pantry|ml|1000|d=1
balsamic|balsamic;balsamic vinegar;balsamic glaze|balzam;balsamic|balzamikový ocet||pantry|ml|250|d=1.1
soy-sauce|soy sauce;soya sauce;tamari;light soy sauce;dark soy sauce|sojov omack;soy sauce;sojova|sójová omáčka|bob,napoj,mlek|pantry|ml|150|d=1.1
passata|passata;tomato puree;tomato sauce;crushed tomatoes;tinned tomatoes;canned tomatoes;diced tomatoes;chopped tomatoes;can of tomatoes;tin of tomatoes|pasat;rajc drcen;drcen rajc;loupan rajc;rajc konzerv;rajc plech;rajc krajen;sekan rajc|drcená rajčata|kecup,omack,pesto,polevk,chips,susen|pantry|g|400|d=1
tomato-paste|tomato paste;tomato concentrate|rajc protlak;protlak|rajčatový protlak|spenat|pantry|g|70|d=1.1
ketchup|ketchup;tomato ketchup|kecup;ketchup|kečup|chips,lupin|pantry|g|500|d=1.1
mustard|mustard;dijon mustard;dijon;wholegrain mustard;english mustard|horcic|hořčice|semin|pantry|g|250|d=1.05
mayonnaise|mayonnaise;mayo|majonez|majonéza|salat,sendvic|pantry|g|250|d=0.95
stock|stock cubes;stock cube;bouillon cube;bouillon;stock;chicken stock;beef stock;vegetable stock;broth;chicken broth;veg stock|bujon;vyvar|bujón|polevk,hotov|pantry|ks|6|
chickpeas|chickpeas;canned chickpeas;garbanzo beans;tinned chickpeas|cizrn|cizrna|mouk,hummus,chips,pomazank,snack|pantry|g|400|
lentils|lentils;red lentils;brown lentils;green lentils|cock|čočka|polevk,salat,chips,hotov,konzerv|pantry|g|500|d=0.8
beans|kidney beans;red kidney beans;black beans;beans;cannellini beans;white beans;baked beans;butter beans|fazol|fazole|zelen,lusk,fazolk,chips,polevk,salat,kava,kakao,vanil|pantry|g|400|
coconut-milk|coconut milk;coconut cream;can of coconut milk|kokos mlek;kokos smetan;kokosov mlek|kokosové mléko|napoj,cokol,jogurt,sprch,sampon|pantry|ml|400|d=1
peanut-butter|peanut butter|arasid masl;arasid krem|arašídové máslo||pantry|g|350|
almonds|almonds;flaked almonds;slivered almonds;ground almonds|mandl|mandle|mlek,napoj,cokol,olej,mouk,susen,krem,tycin,dort,liker,likér,rostlin|pantry|g|100|
walnuts|walnuts;walnut;pecans;cashews;cashew nuts;hazelnuts;mixed nuts;nuts|vlass orech;orech;kesu;liskov|vlašské ořechy|cokol,susen,tycin,krem,nugat,dort,napoj,olej,mlek|pantry|g|100|
peanuts|peanuts|arasid|arašídy|masl,krem,olej,cokol,tycin,flips,susen|snacks|g|200|
seeds|sunflower seeds;pumpkin seeds;seeds;pepitas;sesame seeds;chia seeds;linseed|slunecnic semin;semin slunecnic;dynov semin;semin;sezam;chia|slunečnicová semínka|chleb,peciv,olej,rohlik,bulk,krekr,tycin,ptac|pantry|g|100|
raisins|raisins;sultanas;dried fruit;currants|rozink;sultan;susen ovoc|rozinky|cokol,susen,mus,tycin|pantry|g|200|
chocolate|dark chocolate;chocolate;cooking chocolate;chocolate chips;milk chocolate|cokolad|čokoláda na vaření|napoj,susen,tycin,cerea,krem,pomazank,dort,zmrzlin,jogurt,pudink,polev,mlek napoj,lupin,musli,kase,vlock|snacks|g|100|
cocoa|cocoa;cocoa powder;cacao;unsweetened cocoa|kakao|kakao|napoj,susen,tycin,masl,cokol,instant|pantry|g|100|d=0.45
baking-powder|baking powder|kypric prasek;prasek do peciv;prasek do pecen|prášek do pečiva||pantry|g|12|d=0.9
baking-soda|baking soda;bicarbonate of soda;bicarb soda;bicarb;bicarbonate|jedl sod;soda bikarbon|jedlá soda||pantry|g|50|d=1
yeast|yeast;dry yeast;instant yeast;fresh yeast;active dry yeast|drozd|droždí||pantry|g|7|d=0.6
vanilla|vanilla extract;vanilla;vanilla sugar;vanilla essence;vanilla bean;vanilla pod|vanilk cukr;vanilin cukr;vanilk extrakt;vanilk lusk;vanilk aroma|vanilkový cukr|zmrzlin,pudink,jogurt,mlek,susen,tycin|pantry|g|20|d=1
salt|salt;sea salt;table salt;kosher salt;flaky salt;rock salt|sul=;soli=|sůl|koupel|pantry|g|1000|p=1,d=1.2
pepper|black pepper;pepper;ground pepper;peppercorns;cracked black pepper;freshly ground black pepper;white pepper|pepr|pepř|peprn,peprmint,mat,chips,omack,klobas,salam|pantry|g|25|p=1,d=0.5
paprika|paprika;sweet paprika;smoked paprika;ground paprika;hot paprika|paprik mlet;mlet paprik;uzen paprik|paprika mletá||pantry|g|25|d=0.45
cumin|cumin;ground cumin;cumin seeds|rimsk kmin;kmin rimsk|římský kmín||pantry|g|25|d=0.45
caraway|caraway;caraway seeds|kmin|kmín|rimsk|pantry|g|25|d=0.45
cinnamon|cinnamon;ground cinnamon;cinnamon stick;cinnamon sticks|skoric|skořice|susen,tycin,caj,vlock,cerea,bonbon|pantry|g|20|d=0.55
curry-powder|curry powder;curry;garam masala;turmeric;ground turmeric|kari;curry;garam;kurkum|kari koření|omack,hotov,chips,past,napoj|pantry|g|25|d=0.4
curry-paste|curry paste;red curry paste;green curry paste;yellow curry paste|kari past;curry past;past kari;past curry|kari pasta||pantry|g|100|d=1
chilli-flakes|chilli flakes;chili flakes;red pepper flakes;cayenne;cayenne pepper;chilli powder;chili powder|chilli vlock;chilli mlet;chilli prasek;kajensk pepr;chili mlet|chilli mleté||pantry|g|25|d=0.45
oregano|oregano;dried oregano;italian herbs;mixed herbs;dried herbs;herbes de provence|oregan;italsk bylink;provensal bylink;bylinkov smes|oregano||pantry|g|10|p=1,d=0.2
thyme|thyme;dried thyme;fresh thyme;thyme sprigs|tymian|tymián||pantry|g|10|d=0.3
rosemary|rosemary;fresh rosemary;rosemary sprigs;dried rosemary|rozmaryn|rozmarýn||pantry|g|10|d=0.3
bay-leaves|bay leaves;bay leaf|bobkov list|bobkový list||pantry|g|5|p=1
nutmeg|nutmeg;ground nutmeg|muskat orisek;muskat|muškátový oříšek|vino,mydl|pantry|g|10|d=0.5
garlic-powder|garlic powder;garlic granules;onion powder|cesnek granul;cesnek susen;granulovan cesnek;cibul prasek;cesnek prasek|česnek granulovaný||pantry|g|30|d=0.5
pesto|pesto;basil pesto;green pesto;red pesto|pesto|pesto||pantry|g|190|
olives|olives;black olives;green olives;kalamata olives|oliv|olivy|olej,olivov olej|pantry|g|200|
pickles|pickles;gherkins;dill pickles;cornichons|kysel okurk;steril okurk;okurk steril;cornichon;okurk sterilov;okurk nakladan|sterilované okurky||pantry|g|670|
sauerkraut|sauerkraut|kysan zeli;zeli kysan|kysané zelí||pantry|g|500|
puff-pastry|puff pastry;pastry;shortcrust pastry;filo pastry;phyllo|listov testo;testo listov;lineck testo;filo|listové těsto||frozen|g|400|
jam|jam;strawberry jam;apricot jam;marmalade;preserves|dzem;marmelad;povidl|džem|jogurt,susen,kolac,buch|pantry|g|340|
tea|tea;black tea;green tea;tea bags;herbal tea|caj|čaj|ledov,napoj,limonad|drinks|ks|20|
coffee|coffee;ground coffee;coffee beans;instant coffee;espresso|kava;kavy|káva|cokol,susen,zmrzlin,tycin,liker,likér,filtr,smetan|drinks|g|250|
water|water;sparkling water;mineral water;still water;soda water|voda;vody;mineralk|minerální voda|toalet,micel,kolin,ustni,plet,cist,parf,prac|drinks|ml|1500|
juice|orange juice;juice;apple juice;fruit juice|dzus;100 stav;stava 100|džus||drinks|ml|1000|
beer|beer;lager;pilsner|pivo;piva;lezak|pivo|syr,klobas,sklenic,kvasn|drinks|ml|500|
red-wine|red wine;dry red wine|cerven vino;vino cerven|červené víno|ocet,omack|drinks|ml|750|
white-wine|white wine;dry white wine|bil vino;vino bil|bílé víno|ocet,omack|drinks|ml|750|
crisps|chips;crisps;potato chips;tortilla chips;corn chips|chips;chipsy;lupin|chipsy|hranolk|snacks|g|130|
biscuits|biscuits;cookies;digestive biscuits|susenk;keks|sušenky|psi,kocic,pes,mazlic|snacks|g|200|
toilet-paper|toilet paper;loo roll;toilet roll;toilet rolls|toaletn papir|toaletní papír|vlhc|household|ks|8|
paper-towels|paper towels;kitchen towel;kitchen paper;paper towel|kuchyn uterk;papirov uterk;kuchyn rolk|kuchyňské utěrky|textil,mikrovl|household|ks|2|
dish-soap|dishwashing liquid;dish soap;washing up liquid;dishwashing detergent|prostredek nadobi;jar=;na nadobi;myti nadobi|prostředek na nádobí|tablet,myck,kapsl|household|ml|900|
dishwasher-tabs|dishwasher tablets;dishwasher tabs;dishwasher pods|tablet myck;kapsl myck;myck tablet|tablety do myčky|cistic,sul|household|ks|40|
laundry|laundry detergent;washing powder;laundry liquid;laundry pods;washing liquid|praci prasek;praci gel;praci kapsl;praci prostred;prani gel|prací gel|aviva|household|ks|20|
bin-bags|bin bags;garbage bags;rubbish bags;trash bags|pytl odpad;sack odpad;odpadk pytl|pytle na odpadky||household|ks|20|
shampoo|shampoo|sampon|šampon|pes,koc,psi,auto|household|ml|400|
toothpaste|toothpaste|zubn past|zubní pasta|kartack|household|ml|75|
soap|soap;hand soap;hand wash;liquid soap|mydl;tekut mydl|tekuté mýdlo|nadobi,prac|household|ml|500|
foil|aluminium foil;aluminum foil;foil;baking paper;cling wrap;cling film;parchment paper|alobal;pecic papir;potravin foli;pecic foli|alobal||household|ks|1|
`;

function parseRow(line) {
  const [id, en, cz, q, exc, cat, unit, pack, extra] = line.split("|");
  const x = { id, en: en.split(";").map(s => norm(s)).filter(Boolean), m: cz.split(";").map(a => norm(a).split(" ").filter(Boolean)).filter(a => a.length),
    q: q || cz.split(";")[0], exc: (exc || "").split(",").map(s => norm(s).split(" ").filter(Boolean)).filter(a => a.length),
    cat: cat || "other", unit: unit || "g", pack: +pack || (unit === "ks" ? 1 : 500), d: 1, e: 0, loose: false, pantry: false, subs: [] };
  for (const kv of (extra || "").split(",").map(s => s.trim()).filter(Boolean)) {
    const [k, v] = kv.split("=");
    if (k === "d") x.d = +v; else if (k === "e") x.e = +v; else if (k === "l") x.loose = v === "1";
    else if (k === "p") x.pantry = v === "1"; else if (k === "s") x.subs.push(v);
  }
  // "s=a,s=b" style swaps can also be packed as "s=a;b"
  x.subs = x.subs.flatMap(s => s.split(";")).filter(Boolean);
  const first = en.split(";")[0]; x.name = first.charAt(0).toUpperCase() + first.slice(1);
  x.cz = q || cz.split(";")[0];
  return x;
}

export const ITEMS = ROWS.trim().split("\n").filter(l => l && !l.startsWith("#")).map(parseRow);
export const BY_ID = Object.fromEntries(ITEMS.map(x => [x.id, x]));
// Swaps are listed one-way in the table; make them usable both ways where it makes sense (fresh ↔ frozen).
for (const x of ITEMS) for (const s of x.subs) if (!BY_ID[s]) console.warn("unknown swap", x.id, s);
