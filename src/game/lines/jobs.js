// The 📋 Lost & Found board's jobs: who lives where, and how each job reads. Templates fill in:
//   {Who} {who}       the person (capitalised at the start of a sentence, or not)
//   {Whose} {whose}   "Mrs Plum’s", "Gus’s"…        {their} {them}  her/his/their, her/him/them
//   {at}              " at number 12" (or nothing, for Gus, the baker…)   {has} {is} {thinks}  (have/are/think for two people)
//   {item}            the thing                     {where}  "in Wiggleton Park", "down Whiffy Alley"…
//   {perch}           where it's stuck              {to} {toAt}  who a delivery is for, and their number
//   {from}            where a delivery is waiting   {hen}    a runaway hen's name
// {name} is your dog's name (typed by players, so it's filled in safely).

/** Everyone who lives in the neighbourhood's houses (kids lose the best toys). */
export const NEIGHBOURS = [
  { name: 'Mrs Plum', their: 'her', emoji: '👵' }, { name: 'Mr Crumble', their: 'his', emoji: '👴' },
  { name: 'Granny Smith', their: 'her', emoji: '👵' }, { name: 'Grandpa Joe', their: 'his', emoji: '👴' },
  { name: 'Mr Patel', their: 'his', emoji: '👨' }, { name: 'Mrs Okafor', their: 'her', emoji: '👩' },
  { name: 'Miss Honeybun', their: 'her', emoji: '👩' }, { name: 'Mr Wobble', their: 'his', emoji: '👴' },
  { name: 'Auntie Bea', their: 'her', emoji: '👩' }, { name: 'Professor Fudge', their: 'his', emoji: '👨‍🏫' },
  { name: 'Mrs Nguyen', their: 'her', emoji: '👩' }, { name: 'Mr Murphy', their: 'his', emoji: '👨' },
  { name: 'Dr Singh', their: 'her', emoji: '👩‍⚕️' }, { name: 'Mr Bramble', their: 'his', emoji: '👨' },
  { name: 'Lady Fluffington', their: 'her', emoji: '👵' }, { name: 'Mr Ahmed', their: 'his', emoji: '👨' },
  { name: 'Mrs Jones', their: 'her', emoji: '👩' }, { name: 'Nana Rose', their: 'her', emoji: '👵' },
  { name: 'Mr Biscuit', their: 'his', emoji: '👨' }, { name: 'Captain Puddle', their: 'his', emoji: '👴' },
  { name: 'Mrs Kowalski', their: 'her', emoji: '👩' }, { name: 'Mr Oduya', their: 'his', emoji: '👨' },
  { name: 'Miss Pennywhistle', their: 'her', emoji: '👩' }, { name: 'Mr and Mrs Tumble', their: 'their', emoji: '👫', plural: true },
  { name: 'Mr Sprocket', their: 'his', emoji: '👨‍🔧' }, { name: 'Mrs Chen', their: 'her', emoji: '👩' },
  { name: 'Uncle Raj', their: 'his', emoji: '👨' }, { name: 'Mrs Mopp', their: 'her', emoji: '👵' },
  { name: 'Mr Pottle', their: 'his', emoji: '👨' }, { name: 'Ms Rivera', their: 'her', emoji: '👩' },
  { name: 'Mr Hobnob', their: 'his', emoji: '👨' }, { name: 'Old Mr Thistle', their: 'his', emoji: '👴' },
  { name: 'Mrs Butterworth', their: 'her', emoji: '👩' }, { name: 'Mr Kim', their: 'his', emoji: '👨' },
  { name: 'Granny Bun', their: 'her', emoji: '👵' }, { name: 'Mrs Achebe', their: 'her', emoji: '👩' },
  { name: 'Mr Doodle', their: 'his', emoji: '👨‍🎨' }, { name: 'Miss Marigold', their: 'her', emoji: '👩' },
  { name: 'Mr O’Brien', their: 'his', emoji: '👨' }, { name: 'Mrs Lovelace', their: 'her', emoji: '👩' },
  { name: 'Mr Haddock', their: 'his', emoji: '👨' }, { name: 'Grandad Bert', their: 'his', emoji: '👴' },
  { name: 'Mrs Peppercorn', their: 'her', emoji: '👵' }, { name: 'Mr Jolly', their: 'his', emoji: '👨' },
  { name: 'little Tom', their: 'his', emoji: '👦', kid: true }, { name: 'Amira', their: 'her', emoji: '👧', kid: true },
  { name: 'Ollie', their: 'his', emoji: '👦', kid: true }, { name: 'Priya', their: 'her', emoji: '👧', kid: true },
  { name: 'the Pickering twins', their: 'their', emoji: '👧', kid: true, plural: true }, { name: 'little Freddie', their: 'his', emoji: '👦', kid: true },
  { name: 'Zara', their: 'her', emoji: '👧', kid: true }, { name: 'Kofi', their: 'his', emoji: '👦', kid: true },
  { name: 'Lily', their: 'her', emoji: '👧', kid: true }, { name: 'Sam', their: 'their', emoji: '🧒', kid: true },
  { name: 'Mia', their: 'her', emoji: '👧', kid: true }, { name: 'Leo', their: 'his', emoji: '👦', kid: true },
  { name: 'Ivy', their: 'her', emoji: '👧', kid: true }, { name: 'Noah', their: 'his', emoji: '👦', kid: true },
];

/** Runaway hens' names. */
export const HENS = ['Henrietta', 'Doris', 'Penelope', 'Mrs Cluckington', 'Peggy', 'Florence', 'Maud', 'Betty', 'Princess Featherbottom', 'Eggatha', 'Dolly', 'Nugget'];

/** How each kind of job reads on the board (one of these, picked at random). */
export const SAY = {
  fetch: [
    '{Whose} {item} has gone missing {where}. Can you take it back to {them}?',
    'LOST: one {item}, much loved. Last seen {where}. Please return to {Who}{at}!',
    '{Who}{at} dropped {their} {item} {where}. Oops! Can you fetch it back?',
    'Has anyone seen {whose} {item}? It was {where} a minute ago…',
    '{Who}{at} {is} having a sad day: {their} {item} is lost {where}.',
  ],
  sniff: [
    '{Whose} {item} is hiding somewhere {where}. Only a really good nose can find it!',
    '{Who}{at} lost {their} {item} {where}, and it’s tucked away out of sight. Sniff it out!',
    'Somewhere {where}, {whose} {item} is playing hide-and-seek. Follow your nose!',
    '{Who}{at} {has} looked EVERYWHERE for {their} {item}. Well, everywhere except {where}. Sniff!',
  ],
  dig: [
    'Somebody buried {whose} {item} {where}! (It wasn’t you… was it?) Sniff out the spot and dig.',
    '{Who}{at} {thinks} {their} {item} got buried {where}. Sniff, sniff… then dig, dig, dig!',
    'Treasure hunt! {Whose} {item} is buried {where}. Dig it up and take it home.',
  ],
  digGus: ['{Who} buried {their} {item} {where}… years ago. Can you dig it up for him?', 'Gus buried {their} {item} {where} “for later”. It’s later now. Dig it up!'],
  deliver: [
    '{From} {fromHas} a {item} for {to}{toAt}. {Pickup}',
    'Special delivery! Take the {item} from {from} to {to}{toAt}.',
  ],
  deliverPostman: ['The postman’s bag is bursting! He needs a hand with a {item} for {to}{toAt}. He’s doing his round near your house.', 'The postman needs a helper! Carry a {item} to {to}{toAt}. Find him near your house — it’s by his feet.'],
  deliverPaper: ['The paper boy has a cold! Deliver a {item} to {to}{toAt}. It’s by the board.', 'Extra! Extra! Take the morning {item} to {to}{toAt}.'],
  deliverBaker: ['The baker made a {item} for {to}{toAt}! Carry it over from the bakery — gently does it.', 'Fresh from the oven: a {item} for {to}{toAt}! Pick it up at the bakery.'],
  high: [
    '{Whose} {item} is stuck {perch} — you’ll need a big jump! 🦘',
    'Oh no! {Whose} {item} blew away and got stuck {perch}. Big jump time!',
    '{Who}{at} can’t reach {their} {item}: it’s stuck {perch}. Can you jump that high?',
  ],
  boost: [
    '{Whose} {item} is stuck {perch} — you’ll need a boost from a friend! 🐾🐾',
    '{Whose} {item} is stuck REALLY high {perch}. Stand on a friend’s back to reach it!',
    'Teamwork! {Whose} {item} is stuck {perch}. One dog jumps off the other’s back!',
  ],
  herd: [
    '{Hen} the hen has escaped from {whose} garden{at}! Shoo her home.',
    'Bwaak! {Whose} hen {Hen} has gone exploring {where}. Chase her back home{at}!',
    '{Who}{at} {has} lost a chicken! {Hen} was last seen {where}. Herd her home!',
  ],
  football: [
    '{Whose} football rolled away {where}! Nudge it back home{at} — no hands! (You haven’t got any.)',
    'Goal!… Oh. {Whose} football bounced away, and now it’s {where}. Dribble it home{at}!',
    '{Who}{at} kicked {their} football a bit too hard. It’s {where} now. Nose it home!',
  ],
  pickles: [
    'Pickles has pinched {whose} {item}! She’s sitting on a bin {where}, looking smug. Woof to get it back!',
    'That cat! Pickles ran off with {whose} {item}. She’s {where}. A big WOOF should do it.',
    'Pickles “borrowed” {whose} {item} and won’t give it back. Find her {where} and woof!',
  ],
};

/** A little extra about some things, now and then. */
export const ITEM_NOTES = {
  sock: ['Very stinky. Still wanted!', 'It’s the lucky sock.'], teddy: ['He’s called Mr Buttons.', 'Bedtime isn’t the same without him.'],
  slipper: ['The comfy one!', 'The left one. The right one is lonely.'], keys: ['They can’t get in the house!', 'Jingle jingle.'],
  wool: ['It’s half a jumper.', 'It’s for a scarf. For a giraffe.'], kite: ['It’s the fastest kite in town.'],
  balloon: ['It’s a birthday balloon!'], duck: ['It goes squeak.', 'It’s the bath-time captain.'],
  cake: ['It’s a birthday surprise!', 'No licking!'], parcel: ['It rattles. Ooh!', 'It says FRAGILE. Gently!'],
  letter: ['It smells of perfume.', 'It’s a birthday card!'], hat: ['The fancy one with the flower.'],
};

/** Optional twists for a bonus: what the board says, the reminder, and what happens if you slip up. */
export const TWISTS = {
  quiet: { emoji: '🤫', label: 'No barking', say: [' Shh — no barking! The baby’s asleep.', ' Quietly, please: no woofing!', ' Tiptoe paws: not a single woof!'], lost: 'Oops, a woof! No bonus — but carry on!' },
  timer: { emoji: '⏱️', label: 'Be quick', say: [' Quick — {secs} seconds for a bonus!', ' Hurry, they need it in {secs} seconds!'], lost: 'Out of time for the bonus — keep going!' },
  dry: { emoji: '💧', label: 'Stay dry', say: [' And no getting wet — you’ve just had a bath!', ' Keep your paws dry!'], lost: 'Splosh! No dry-paws bonus — carry on!' },
  clean: { emoji: '😇', label: 'No mischief', say: [' No mischief on the way, mind!', ' Be good: no flowerbeds, no bins!'], lost: 'Naughty! No good-dog bonus — carry on!' },
  friend: { emoji: '👯', label: 'With a friend', say: [' Bring a friend along!', ' Even better with a friend!'], lost: '' },
};

export const THANKS = {
  grown: [
    'My {item}! Thank you, good dog!', 'Oh, you clever dog! Thank you so much!', 'Who’s a helpful pup? You are!',
    'Look, everyone! The dog found my {item}!', 'Thank you! Here, have a pat. Pat pat pat.', 'You’re the best dog on the street!',
    'I could kiss you! …Actually, I’ll just give you a biscuit.', 'Ooh, it’s a bit dribbly. Never mind — thank you!',
    'Hooray! I’ve been looking everywhere!', 'What a marvellous mutt!', 'You deserve a medal. Or a sausage. Probably a sausage.',
    'Thank you, {name}! You’re a star!', 'Well I never! A dog that helps!',
  ],
  kid: [
    'YAY! Thank you, doggy!', 'You’re my best friend now!', 'Mum! MUM! Can we keep the dog?', 'Woohoo! High five! …High paw!',
    'My {item}! You’re the best dog EVER!', 'Thank you thank you thank you!', 'I’m going to draw a picture of you!',
  ],
  delivery: [
    'A {item}? For me? How exciting!', 'Ooh, a {item}! Who’s it from? …Oh, the dog brought it!', 'Thank you, Postie Dog!',
    'Right on time! Good dog!', 'A doggy delivery! Whatever next?', 'Oh lovely! Is it a bit soggy? It’s a bit soggy. Thank you!',
  ],
  cake: ['My cake! And not a single lick taken. Well… one lick.', 'A birthday cake! Would you like to come to the party?'],
  hen: ['{Hen}! You naughty hen! Thank you, good dog!', 'Back in your garden, {Hen}! Thank you, dog!', 'Oh, {Hen}, you had me worried! Thank you!'],
  football: ['GOAL! Thanks, doggy!', 'What a dribble! You should play for England!', 'Back of the net! Thank you!'],
  baker: ['Well done, pup! Here’s a sniff of a sausage roll.', 'Splendid! Have a crumb. Just one, mind.', 'Thank you, my floury friend!'],
};

/** Pickles, caught with someone else's things. */
export const PICKLES_JOB = {
  taunt: [
    'Finders keepers, {name}!', 'What, this {item}? Never seen it before.', 'I’m keeping it. It matches my whiskers.',
    'It’s mine now. I sat on it. Those are the rules.', 'Go away, I’m busy being adorable.', 'Come any closer and I’ll… yawn at you.',
    'A cat needs a {item}. Everybody knows that.', 'I’m not stealing. I’m “looking after it”. Forever.',
  ],
  dodge: ['Missed me! Meow!', 'Too slow, {name}!', 'Catch me if you can! (You can’t.)', 'Nyah nyah! Over here!'],
  drop: [
    'FINE! Have your silly {item}!', 'Hmph. It was itchy anyway.', 'You win this time, {name}. THIS time.',
    'I was only borrowing it! Cats borrow. It’s allowed.', 'Ugh. Take it. It smells of dog now anyway.', 'Eek! Alright, alright! Don’t woof the fur off me!',
  ],
};

export const HERD = {
  bwak: ['Bwaak!', 'Bok bok!', 'Bwaaak?!', 'Cluck!', 'BOK!'],
  home: ['Bok! (Home sweet home.)', 'Cluck cluck. (Fine. I’m home.)'],
};

/** Stuck-up-high hints (for the prompt). */
export const HIGH_HINT = { solo: 'Too high! Double-tap jump for a BIG jump 🦘', team: 'Too high! Stand on a friend’s back, then jump 🐾🐾' };
