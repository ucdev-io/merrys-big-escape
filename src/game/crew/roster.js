/*
 * 🐾 The town dogs: ten dogs who live around town (and out in the woods, at the farm and on the beach). Each
 * has its own way to make friends (`want`, see ./townDogs.js). Make friends and they join your crew (see
 * ./crew.js): up to three come along with you, the rest hang out in your garden. The same ten live in every
 * town, and your pals stay your pals (they're saved with your dog, like its stars: see ./pals.js).
 *
 *   home   where they live: a place type (park, pond, bakery, alley), an area (woods, farm, beach), or
 *          'garden' (somebody else's garden, behind a fence), 'street' (out and about on the pavements)
 *   want   how to make friends: hide (sniff them out), treat (bring something tasty), swim (fetch from the
 *          water), dig (dig them out under their fence), copy (do the same trick), chase (catch them),
 *          race, howl (howl along), fetch (bring the ball back)
 *   skill  what they're good at (shown on their card; their help with it comes later)
 *   breed  their breed, and `alt` for when your own dog is that breed (so you never meet your twin)
 */
export const PALS = [
  { id: 'biscuit', name: 'Biscuit', breed: 'banjo', alt: 'kiko', home: 'park', want: 'hide', skill: 'nose',
    blurb: 'A beagle whose nose is never off the ground. Loves hide-and-seek.' },
  { id: 'noodle', name: 'Noodle', breed: 'teddy', alt: 'waffles', home: 'bakery', want: 'treat', skill: 'dig',
    blurb: 'A sausage dog who lives for snacks. Especially sausages.' },
  { id: 'barnaby', name: 'Barnaby', breed: 'bernie', alt: 'cloud', home: 'pond', want: 'swim', skill: 'big',
    blurb: 'A big, gentle Bernese who won’t get his paws wet. Big enough to give anyone a leg-up.' },
  { id: 'tank', name: 'Tank', breed: 'bruno', alt: 'winston', home: 'garden', want: 'dig', skill: 'dig',
    blurb: 'A Staffy stuck behind his garden fence, longing for an adventure.' },
  { id: 'pebble', name: 'Pebble', breed: 'mochi', alt: 'frankie', home: 'alley', want: 'copy', skill: 'look',
    blurb: 'A pug who knows every trick in the book, and wants to see yours.' },
  { id: 'sprout', name: 'Sprout', breed: 'peanut', alt: 'pompom', home: 'street', want: 'chase', skill: 'quick',
    blurb: 'A tiny Chihuahua who is very, very fast. Catch him if you can!' },
  { id: 'zip', name: 'Zip', breed: 'scout', alt: 'ziggy', home: 'farm', want: 'race', skill: 'run',
    blurb: 'A farm collie who races everything: sheep, tractors, the wind.' },
  { id: 'willow', name: 'Willow', breed: 'flash', alt: 'merry', home: 'beach', want: 'race', skill: 'run',
    blurb: 'A greyhound who loves a long run on the sand.' },
  { id: 'fern', name: 'Fern', breed: 'luna', alt: 'cloud', home: 'woods', want: 'howl', skill: 'look',
    blurb: 'A husky who lives in the woods and sings to the trees.' },
  { id: 'bonnie', name: 'Bonnie', breed: 'sunny', alt: 'bramble', home: 'park', want: 'fetch', skill: 'carry',
    blurb: 'A golden retriever who would play fetch all day if you let her.' },
];

export const PAL = Object.fromEntries(PALS.map((p) => [p.id, p]));

/** What each skill means (for their card). */
export const SKILLS = {
  nose: { emoji: '👃', name: 'Super sniffer' },
  dig: { emoji: '🕳️', name: 'Digger' },
  big: { emoji: '💪', name: 'Leg-up' },
  look: { emoji: '👀', name: 'Lookout' },
  quick: { emoji: '💨', name: 'Speedy' },
  run: { emoji: '🏃', name: 'Runner' },
  carry: { emoji: '🎾', name: 'Carrier' },
};

/** A pal's breed, given the player's own (never the same as yours). */
export const palBreed = (p, mine) => (p.breed === mine ? p.alt : p.breed);
