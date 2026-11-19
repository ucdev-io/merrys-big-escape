// Everything the page says, shared by every design. Merry is a girl (she/her).
// Plain, general words: what the game is and what you can do in it.

export const TITLE = 'Merry’s Big Escape';
export const TAGLINE = 'A muddy-pawed adventure for dogs who follow their noses.';
export const PLAY_URL = '/play/';

export const SHOTS = {
  garden: { src: '/shots/garden.jpg', alt: 'Merry the whippet in her back garden, beside a paddling pool and a picket fence' },
  town: { src: '/shots/town.jpg', alt: 'Merry on the pavement of a painted street of little houses' },
  heist: { src: '/shots/heist.jpg', alt: 'Merry creeping up on the baker’s stall of pastries while pigeons peck about' },
  woods: { src: '/shots/woods.jpg', alt: 'Merry close up in autumn woods, with a fallen log and a red toadstool' },
  farm: { src: '/shots/farm.jpg', alt: 'Merry by the farm’s wooden pens, with a flock of sheep nearby' },
  beach: { src: '/shots/beach.jpg', alt: 'Merry on a sandy beach looking out at the sea and a striped lighthouse' },
  snow: { src: '/shots/snow.jpg', alt: 'Merry in a snowy street, with fairy lights along the roofs' },
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
    id: 'town', icon: '🏘️', label: 'The town', shots: ['town'],
    title: 'A neighbourhood to explore',
    text: 'Every town is different. Help Gus the old basset hound find his things, take Pepper the hedgehog for a walk, play hide-and-seek with Nut and Meg the squirrels, and pick jobs off the Lost & Found board. Knocking over a bin is optional, but very tempting.',
    trick: 'sit',
  },
  {
    id: 'heists', icon: '🥐', label: 'Heists', shots: ['heist'],
    title: 'Cheeky heists',
    text: 'The baker keeps glancing round. Grab a pastry while her back’s turned and run it home before she shouts “Oi!”. The butcher’s string of sausages is just as tempting, and someone’s always having a barbecue.',
    trick: 'dance',
  },
  {
    id: 'beyond', icon: '🌲', label: 'Beyond', shots: ['woods', 'farm', 'beach'],
    title: 'Past the edge of town',
    text: 'Wake the owl in the woods, help Brock the badger, and drag big sticks to the den. Round up Farmer Mabel’s sheep. Race the waves, dig for shells and build sandcastles at the beach. Mud is glorious, and a paddle washes it off.',
    trick: 'roll',
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
    text: 'Play as Merry, or as a sausage dog, a corgi, a pug, a collie, a husky… Earn stars as you go, level up, and dress up in collars, bandanas and hats.',
    trick: 'dance',
  },
  {
    id: 'pack', icon: '👥', label: 'Packs',
    title: 'Better in a pack',
    text: 'The full game runs a little server on a computer at home, so friends on the same Wi-Fi can join each other with one tap, for races, bone rushes, pigeon panic and duck round-ups. This web demo is just you and Merry.',
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
export const IPHONE_TIP = 'Slow on an iPhone? If Lockdown Mode is on, Safari runs games much more slowly. You can turn it off for just this site: tap aA → Website Settings.';
