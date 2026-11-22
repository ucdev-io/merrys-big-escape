// Everything the page says, shared by every design. Merry is a girl (she/her).
// Plain, general words: what the game is and what you can do in it.

export const TITLE = 'Merry’s Big Escape';
export const TAGLINE = 'A muddy-pawed adventure for dogs who follow their noses.';
export const PLAY_URL = '/play/';

// The postcards: the picture, what's in it (for screen readers), and the caption written on it.
export const SHOTS = {
  garden: { src: '/shots/garden.jpg', cap: 'Home sweet garden', alt: 'Merry the whippet in her back garden, beside a paddling pool and a picket fence' },
  sniff: { src: '/shots/sniff.jpg', cap: 'Follow that smell!', alt: 'Merry sniffing the pavement, with a short trail of golden and pink scent puffs leading through a fence to a smell on the lawn' },
  bone: { src: '/shots/bone.jpg', cap: 'A golden bone!', alt: 'Merry looking up at a golden bone on top of a stack of crates' },
  town: { src: '/shots/town.jpg', cap: 'The neighbourhood', alt: 'Merry on the pavement of a painted street of little houses' },
  heist: { src: '/shots/heist.jpg', cap: 'Shh… the bakery', alt: 'Merry creeping up on the baker’s stall of pastries while pigeons peck about' },
  woods: { src: '/shots/woods.jpg', cap: 'Conker woods', alt: 'Merry close up in autumn woods, with a fallen log and a red toadstool' },
  farm: { src: '/shots/farm.jpg', cap: 'The farm', alt: 'Merry by the farm’s wooden pens, with a flock of sheep nearby' },
  beach: { src: '/shots/beach.jpg', cap: 'The beach', alt: 'Merry on a sandy beach looking out at the sea and a striped lighthouse' },
  ufo: { src: '/shots/ufo.jpg', cap: 'Planet Boing!', alt: 'Merry leaping high above the purple ground of Planet Boing, beside a flying saucer and two round little aliens' },
  fair: { src: '/shots/fair.jpg', cap: 'Wagtail Wonderland', alt: 'Merry at the theme park, with a rollercoaster train, the big wheel and bunting behind her' },
  cruise: { src: '/shots/cruise.jpg', cap: 'All aboard!', alt: 'Merry on the sunny deck of a cruise ship by the pool, with deckchairs and a red funnel up above' },
  show: { src: '/shots/show.jpg', cap: 'Clear round!', alt: 'Merry flying over a jump on the agility course at the Big Dog Show' },
  pickles: { src: '/shots/pickles.jpg', cap: 'Pickles', alt: 'Merry looking up at Pickles the ginger cat on a picket fence, with a shelf of dug-up treasures in the garden behind' },
  snow: { src: '/shots/snow.jpg', cap: 'Snow day!', alt: 'Merry in a snowy street, with fairy lights along the roofs' },
};

/**
 * The stops (or pages), in order. trick: what Merry does when you arrive.
 * The first is the welcome and the last is the invitation to play.
 */
export const STOPS = [
  {
    id: 'hello', icon: '🐾', label: 'Hello',
    title: TITLE,
    text: 'Meet Merry, a whippet with a nose for adventure. She’s fast, skinny and always cold, and she’s about to escape her garden.',
    trick: 'bow',
  },
  {
    id: 'garden', icon: '🏡', label: 'The garden', shots: ['garden'],
    title: 'Escape the garden',
    text: 'Every dog starts in their own back garden. Sniff out the buried treasure, find a way past the fence, and the whole neighbourhood is yours.',
    trick: 'spin',
  },
  {
    id: 'nose', icon: '👃', label: 'Your nose', shots: ['sniff', 'bone'],
    title: 'Follow your nose',
    text: 'Hold sniff and the smells around you puff up, with a golden trail to the nearest one. Golden bones are hidden all over town, often somewhere high: climb a crate, a bench or a car to reach them, and some need a friend to stand on.',
    trick: 'bow',
  },
  {
    id: 'town', icon: '🏘️', label: 'The town', shots: ['town'],
    title: 'A neighbourhood to explore',
    text: 'Every town is different. Help Gus the old basset hound find his things, take Pepper the hedgehog for a walk, play hide-and-seek with Nut and Meg the squirrels, and pick jobs off the Lost & Found board. Knocking over a bin is optional, but very tempting.',
    trick: 'sit',
  },
  {
    id: 'heists', icon: '🥐', label: 'Mischief', shots: ['heist'],
    title: 'A bit of mischief',
    text: 'The baker keeps glancing round. Grab a pastry while her back’s turned and run it home before she shouts “Oi!”. Every bit of mischief fills the naughty meter, though, and when it’s full, Doug the dog warden comes looking. Do zoomies to lose him, or sneak out of the rescue centre and free the other dogs on your way.',
    trick: 'dance',
  },
  {
    id: 'beyond', icon: '🌲', label: 'Beyond', shots: ['woods', 'farm', 'beach'],
    title: 'Past the edge of town',
    text: 'Wake the owl in the woods, help Brock the badger, and drag big sticks to the den. Round up Farmer Mabel’s sheep. Race the waves, dig for shells and build sandcastles at the beach. Mud is glorious, and a paddle washes it off.',
    trick: 'roll',
  },
  {
    id: 'trips', icon: '🎡', label: 'Days out', shots: ['ufo', 'fair', 'cruise'],
    title: 'Off on a day out',
    text: 'Squeeze down a drain to help Nibbles the rat in the sewers. Stand in the crop circle on the farm and get beamed up to Planet Boing, where every jump is floaty. Catch the bus to Wagtail Wonderland for the rollercoaster and the dodgems, or hop in the little boat out to the Sunny Dolphin, a cruise ship with a pool to cannonball into.',
    trick: 'spin',
  },
  {
    id: 'daily', icon: '📅', label: 'Every day', shots: ['show', 'pickles'],
    title: 'Something new every day',
    text: 'Today’s walk sets three new goals every day. Take the bus to the Big Dog Show for agility, tricks and frisbees, and win rosettes. Woof at Pickles the cat for one of her games, earn medals for your best scores, and fill the shelf by your front door with every treasure you dig up.',
    trick: 'bow',
  },
  {
    id: 'seasons', icon: '❄️', label: 'Seasons', shots: ['snow'],
    title: 'Every season',
    text: 'The town follows the real calendar: snowmen and sledging in winter, leaf piles and conkers in autumn, an egg hunt in spring and paddling pools in summer.',
    trick: 'howl',
  },
  {
    id: 'dogs', icon: '🐕', label: 'The dogs',
    title: '31 dogs to be',
    text: 'Play as Merry, or as a sausage dog, a corgi, a pug, a collie, a husky… Earn stars as you go, level up, and dress up in collars, bandanas and hats, some of them only won on your adventures.',
    trick: 'dance',
  },
  {
    id: 'pack', icon: '👥', label: 'Packs',
    title: 'Better in a pack',
    text: 'The full game runs a little server on a computer at home, so friends on the same Wi-Fi can join each other with one tap, for races, bone rushes, pigeon panic and duck round-ups, and even days out together. This web demo is just you and Merry.',
    trick: 'spin',
  },
  {
    id: 'play', icon: '▶', label: 'Play',
    title: 'Ready?',
    text: 'The demo runs in your browser on a phone, tablet or computer. Nothing to install, and your progress stays on your device.',
    trick: 'bow',
  },
];

export const ABOUT = 'Made with three.js and a hand-tuned watercolour shader, built with Claude Code.';
// (A quiet nod to the secret hidden in the game: what it is and how to find it stay a secret.)
export const SECRET = '✦ Psst… a secret shines somewhere in the game.';
export const IPHONE_TIP = 'Slow on an iPhone? If Lockdown Mode is on, Safari runs games much more slowly. You can turn it off for just this site: tap aA → Website Settings.';
