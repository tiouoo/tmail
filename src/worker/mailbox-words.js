// Short, readable words keep even five-word local parts below 64 characters.
export const mailboxWords = [...new Set(`
able active agile airy alert alive amber ample ancient apricot aqua arctic
artful astral auburn autumn avid azure balanced basic beaming beloved bold
brave breezy bright brisk bronze bubbly buoyant calm candid capable careful
caring casual cedar cheerful cherry chilly clever cloudy cobalt comfy coral
cosmic cotton cozy crafty creamy crisp curious dainty daring dazzling decent
deep deft delicate denim devoted dreamy eager early earnest easy echo electric
elegant emerald endless even fair faithful fancy fast fearless festive fiery
fine floral flowing fluffy focused fond forest frank free fresh friendly frosty
full funny gentle gifted glad gleaming golden graceful grand grateful gray
green growing handy happy hardy hazel hearty helpful hidden honest hopeful
humble icy ideal indigo jolly joyful keen kind kindly lasting lazy leafy light
lilac lively logical lonely lovely loyal lucid lucky lunar lush magic mellow
merry mighty mild mint misty modest modern mossy moving muted natural neat
nimble noble novel ocean odd olive open orange orderly patient peaceful pearly
perfect perky pink placid playful poised polar polite polished precise pretty
proud purple quaint quick quiet radiant rapid rare ready regal relaxed rich
rosy round royal ruby rugged rustic sage sandy scarlet serene sharp shiny shy
silky silver simple sincere sleek sleepy slender slow small smart smooth snug
snowy soft solar solid sonic spare sparky speedy spicy spring spruce stable
starry steady stellar still stone stormy strong subtle summer sunny superb
sweet swift teal tender tidy tiny toasted tranquil true trusty upbeat urban
valiant velvet vivid warm wavy welcome white wild willing windy wise witty
wonderful wooden woolly yellow young youthful zesty zippy

acacia acorn agate albatross alder almond alpine anemone antelope apple arbor
aspen aster atlas aurora avocado azalea badger bamboo banana banyan barley
basil bay beacon beaver beech beetle berry birch bird blossom bluebell bobcat
boulder branch brook bud buffalo butterfly cactus camel canyon cardinal carrot
cascade cassia cedarwood celery chameleon chestnut chickadee cicada cinnamon
citron citrus clover coast coconut comet conifer cosmos coyote crane creek
crest cricket crocus crystal cypress daffodil dahlia daisy damson dandelion
dawn deer delta desert dew dolphin dove dragon dragonfly drift dune eagle
earth ebony egret elder elm ember evening falcon fauna feather fennel fern
field finch firefly fjord flax flint flora flower fog fox freesia frost galaxy
garden garnet gazelle gecko ginger glacier glade glow goose granite grape
grass grove gull harbor hare hawk hazelnut heath heather hedge heron hill
horizon hornbill hummingbird hyacinth ibex ibis ice iris island ivory ivy
jade jaguar jasmine jay jellyfish juniper kestrel kingfisher kiwi koala koi
lake lamb larch lark laurel lava lavender leaf lemon lemur leopard lettuce
lichen lily lime lion lotus lynx magnolia magpie mango maple marigold marlin
marsh meadow melon meteor mica midnight minnow moon moonbeam moonlight moose
morning mountain mulberry mushroom myrtle narwhal nectar nettle night oak
oasis oat obsidian opal orchid oriole otter owl oyster panda pansy papaya
parrot parsnip peach peacock peanut pear pebble pelican pepper petal petrel
pheasant pine planet plum poplar poppy prairie primrose puffin pumpkin quartz
quail quince rabbit raccoon rain rainbow raven ray reef reindeer reed rhino
ridge river robin rock root rosemary rowan saffron salmon sand sapling savanna
scallop sea seal sequoia shadow shell shore shrimp skylark slate sloth snail
snow snowdrop songbird sorrel sparrow spice spider springtime sprout squid
squirrel star starfish starlight stem stream summit sun sunbeam sunflower
sunrise sunset swallow swan tamarind tangerine thistle thorn thyme tide tiger
timber topaz toucan trail tree trout tulip tundra turtle valley vanilla vapor
violet walnut wave whale wheat willow wind wing winter wolf woodland wren yak
yarrow yew yucca zebra zinnia

abbey academy accent accord acrobat actor adobe aero airship album alcove
anchor anthem anvil arcade arch archive arena arrow art artist atelier atom
attic audio avenue badge bagel bakery balloon ballet ballad band banjo banner
basket baton bayou beach bell bench beret bicycle biscuit blanket block boat
bonbon book bookmark booth bottle bowl box braid bread breeze bridge brick
brocade brush bubble bucket buckle bundle cabin cable cafe cake camera candle
candy canvas capsule captain caramel caravan cargo carpet carriage cartoon
castle cello ceramic chalet chalk chapel charm chart cheese chime choir chord
cinema circle city clarinet clock cloth coach cocoa coffee coin compass cookie
copper corner cottage course court craft crayon crown cube cup cupboard
cupcake curtain cushion dance dancer deck design diamond diary dice digit diner
disco dock domino donut doodle door draft dream dress drum duet easel east
eclair edge engine epoch fabric fable fan feast ferry fiber fiddle figure film
flag flame flash flute foam folder fountain frame fresco fringe gate
gem globe glove gong grain grid guitar hammock hand harp hat haven heart
helmet hexagon hinge hobby honey hoop hour house image ink jacket jar jazz jewel
jigsaw journey journal joy jug kettle key keyboard kiosk kite kit ladder lamp
lantern lattice layer lens letter library linen loaf lock loft loom lounge
lullaby lunch lyric lyricist magnet mansion marble market mask mast melody
memo mesh metal meter mirror mitten model mosaic motion motor muffin mural
museum music napkin needle nest north note notebook nugget number opera orbit
organ origami outline oven palace palette pancake paper parcel parchment park
pastel pastry patch path patio pattern pause pencil pendant penny perfume
photo piano picnic picture pier pillow pinwheel pixel plaza pocket poem poet
poetry popcorn portal postcard poster pot pottery prism puzzle quilt radio
raft ribbon ring ripple road rocket roof room rope sail sailor salad satin
scale scarf scene scone screen scroll sculpture seam seed shadowbox shawl sheet
shelf shield ship shoe sign sketch ski sleeve slide smile soap sock sofa solo
sonata song spark sphere spiral spoon spot square stage stamp station steam
steel step sticker stitch story studio sugar suitcase sundial supper swing
symbol table taffy tango tapestry tart tea teacup temple tent thread ticket tile
toast token tower toy train travel tray trellis triangle trinket trumpet tune
tunnel twine type vase vault verse vest village vinyl vista voyage
waffle wagon walk watch water wax wheel whistle window wire wish workshop yarn
year zest zigzag zone

ada adrian aiden alan albert alex alice alma amelia amir amy andre anna annie
anton arden aria arlo arthur asha asher audrey avery axel beau bella ben bill
blair blake bonnie boris bowen brady bruno caleb calvin cameron cara carla
carmen carol carter casey cassie celia charlie chloe clara clark cleo cody colin
conrad cora corey dahlia dale dana daniel daphne darcy dario david dean delia
denis diana dora dorian drew eden edgar edith edmund edwin eileen elena eli
elias elise ella ellie ellis elsa elton emery emil emilia emma enzo eric erin
ernest esme esther ethan etta eva evan evelyn ezra felix fiona finn flora flynn
frances frankie freya gabriel gavin gemma george gia gideon gina glenn grace
grant greta griffin gus hal hannah harley harper harris harvey hazel hector
heidi helen henry hugh hugo ida imogen inez ingrid irene isaac isla ivan ivo
jack jacob jamie jane jasper jayden jean jesse joan joel jonah jordan joseph
josie joyce jude julia julian june kai kara kate keira kelly kelsey ken kevin
kieran kira kit lana laura lauren leah lena lennon leo leon leona levi lewis
liam lila lily lina linus lisa logan lois lola loren louis luca lucas lucia
lucy luis luke luna lydia lyra mabel mae magnus mara marco margot maria marie
marina marion mark marley martha martin mason matteo maude max maya megan mia
milo mina mira miranda molly morgan nadia nancy naomi nathan nell nelson nia
nico nina noah noel nolan nora norman nova odette odin olga oliver olivia omar
opal oren oscar otis owen paige pamela parker pascal patrick paul pearl pedro
penny percy peter petra philip phoebe piper polly quentin quinn rachel rafael
ralph ramona ray reed reese remy rene rhea rhys riley rita river robert robin
roman ronan rosa rose rosie rowan roy ruby rudy rufus ryan sabrina sadie sage
sally sam samson sandra sasha saul scarlett sean selena serena seth shane shawn
shea shelby sierra simon sky skyler sofia sonia sophie spencer stella stefan
stephen stuart summer susan sven sylvia tanya tara taylor tessa theo thomas
tilda toby tom tony tristan troy uma ursula val vera victor vincent viola
vivian wade walter warren wayne wesley will willow winnie wyatt xander xavier
yara yasmin yuri zane zara zelda zeno zoe
`.trim().split(/\s+/))];
