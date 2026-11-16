// 🚜 Everything said on the Farm: Farmer Mabel, the sheep, the hens and Rory the rooster, the pigs (Percy
// in particular), the crow on the scarecrow's hat, the hay, and the farm's smells.
// {name} = your dog's name. {who} = a friend's dog's name. {n} = a number.

export const FARMER_NAME = 'Farmer Mabel';

export const FARMER = {
  hello: [
    'Hello, {name}! I’m Farmer Mabel. Welcome to the farm, pet!',
    'Ooh, a visitor! I’m Farmer Mabel. Mind the mud, it gets everywhere.',
  ],
  // Asks for help (the jobs take turns).
  sheep: [
    'Oh, {name}, my sheep have wandered all over the field! Could you round them up into the pen for me?',
    'I could do with a proper sheepdog! Round the sheep into their pen? Go round behind them, gently does it.',
    'Sheep, sheep, everywhere! Be a love and shoo them all into the pen, would you?',
  ],
  eggs: [
    'The hens have laid their eggs all over the farm again! Could you find three and pop them in my basket? Gently, mind!',
    'Eggs! Somewhere! Hens are hopeless at keeping track. Three eggs for my basket, please.',
    'Breakfast is in trouble: the hens have hidden their eggs. Could you sniff out three for my basket?',
  ],
  pig: [
    'Oh no, Percy’s escaped AGAIN! Could you shoo him back into the sty for me?',
    'Has anyone seen Percy? He’s a pig. He’s out. Again! Could you herd him back home?',
    'Percy’s gone on one of his little adventures. Could you shoo him back to the sty?',
  ],
  pumpkins: [
    'It’s harvest time! Could you fetch three pumpkins from the field and bring them to the cart by the barn?',
    'Pumpkins for the harvest supper! Three to the cart, please. Little ones, I’m not daft.',
  ],
  lamb: [
    'One of the lambs has gone off exploring! Could you find her and bring her back to her mum in the field?',
    'A little lamb’s lost! She’ll follow you if you find her. Bring her back to the sheep field?',
  ],
  hay: [
    'Brr! The sheep are hungry in this cold. Could you carry three armfuls of hay from the barn to their hay rack?',
    'Snow on the grass means hay for the sheep. Three armfuls from the barn to the rack in their field, please!',
  ],
  apples: [
    'The pigs would LOVE some apples. Could you bring three windfalls from the orchard to their trough?',
    'Apples are falling off the trees in the orchard! Three for the pigs’ trough, please?',
  ],
  // Done!
  thanks: [
    'Champion! Ta ever so, {name}!',
    'Oh, you’re a grand dog, {name}. Thank you!',
    'Lovely job! Best helper this farm’s ever had.',
    'Ee, that’s smashing. Thank you, pet!',
    'Marvellous! You’d make a fine farm dog, {name}.',
  ],
  // Still working on it.
  remind: {
    sheep: ['The sheep are in the field. Get behind them and they’ll go where you want!', 'Into the pen with them! Come at them from the far side.'],
    eggs: ['Still some eggs to find! The hens like hiding them in hay.', 'Sniff about! Eggs in the barn, by the pond… anywhere, really.'],
    pig: ['Percy runs away from dogs, so get behind him and walk him to the sty gate!', 'Shoo him back through the gate in the wall!'],
    pumpkins: ['The pumpkins are in the field, by the gate. Three for the cart!'],
    lamb: ['She’ll follow you once you find her. Listen for the little “meh”!'],
    hay: ['The hay’s in the barn: the big pile at the back. The rack’s in the sheep field.'],
    apples: ['The apples are under the trees in the orchard, behind the barn.'],
  },
  idle: ['Busy, busy! Come back in a bit, pet.', 'Mind the mud!', 'Lovely day for it!', 'The kettle’s on. Well, it would be.', 'Have you met Percy? Don’t believe a word he says.'],
  egg: ['Gently does it… perfect!', 'In the basket! Lovely.', 'Not a crack on it. Clever dog!', 'Ooh, a big one!'],
  pumpkin: ['What a beauty!', 'Into the cart! Pumpkin soup tonight.', 'Lovely and round!'],
  hayIn: ['Munch munch! The sheep say thank you.', 'Lovely sweet hay. In it goes!'],
  apple: ['Crunch! The pigs are delighted.', 'Oink oink, they say. That means thank you.'],
  roundup: [
    'Baa-rilliant! Every last sheep in the pen!',
    'Would you look at that! A proper sheepdog round-up!',
    'All in! You’re a natural, you are.',
  ],
  letOut: ['Off you go, girls! Back to the grass.', 'Gate’s open! Off they trot.'],
  rosette: '🏅 A rosette for the barn door! ({n} round-ups at this farm)',
};

export const SHEEP = {
  baa: ['Baa!', 'Baaa!', 'Meh-eh-eh!', 'Baa?', 'Mbaa!'],
  scared: ['BAA!', 'Baa-aa-aa!', 'Eek! Baa!', 'Run, girls!'],
  lamb: ['Meh!', 'Mee-eh!', 'Mehh?'],
  penned: ['In we go!', 'Baa! Fine, fine.', 'Cosy in here.'],
  liquorice: ['Liquorice the black sheep does what she likes.', 'Baa. (Liquorice doesn’t do pens.)'],
};

export const HENS = {
  bwak: ['Bwak!', 'Bwaaak!', 'Cluck cluck!', 'BAWK!', 'Puk-puk-puk!'],
  rory: ['COCK-A-DOODLE-DOO!', 'Cock-a-doodle… oh. Not morning.', 'COCK-A-DOODLE-WOOF? No, that’s not right.', 'I’m Rory. I’m in CHARGE here.'],
};

export const PIGS = {
  oink: ['Oink!', 'Snort snort!', 'Oink oink!', 'Grunt!'],
  roll: ['Wheee! Mud buddies!', 'Roll roll roll!', 'The pigs love a good roll too!'],
  percyOut: ['Oink! Freedom!', 'Wheee!', 'Can’t catch me!'],
  percyHome: ['Oink… fine. Home it is.', 'Back in the mud! Lovely.', 'Snort. Was fun while it lasted.'],
  hello: ['Oink? (That means hello.)', 'Snuffle snuffle!', 'Got any snacks?'],
};

export const CROW = {
  caw: ['Caw!', 'Caw caw!', 'CAW!'],
  scarecrow: ['The scarecrow isn’t very scary, is he?', 'That crow’s not scared of the scarecrow at all!'],
};

export const HAY = {
  castle: ['King of the hay castle!', 'Queen of the hay castle!', 'Top of the hay! 🌾'],
  loft: ['Up in the hayloft!', 'Ooh, cosy up here.'],
  tractor: ['Brrrm brrrm! 🚜', 'On top of the tractor!'],
  lamb: ['Meh! (She’s following you!)', 'Mee-eh! (Found you!)'],
};

// Farm smells (see game/town/smells.js): where 'farm' spots smell of these.
export const FARM_SMELLS = {
  sheep: { emoji: '🐑', name: 'Sheep', xp: 4, lines: ['Sheep! Woolly, warm and a bit… sheepy.', 'A sheep stood here and thought about grass for ages.', 'Wool and grass and baa. Definitely sheep.'] },
  hay: { emoji: '🌾', name: 'Hay', xp: 3, lines: ['Sweet, dry hay. Smells like summer!', 'Hay! Tickly up the nose. Achoo!'] },
  pig: { emoji: '🐷', name: 'Pig', xp: 4, lines: ['Pig! Muddy, snorty, VERY interesting.', 'A pig rolled here. You can tell.', 'Percy was here. Of course he was.'] },
  hen: { emoji: '🐔', name: 'Hens', xp: 3, lines: ['Hens! Feathery and flappy.', 'Chicken smell. Bwak, as they say.'] },
  egg: { emoji: '🥚', name: 'An egg?', xp: 5, lines: ['Eggy! A hen’s been sitting here.', 'Smells like breakfast. Where’s the egg?'] },
  tractor: { emoji: '🚜', name: 'Tractor', xp: 3, lines: ['Oily, muddy tractor tyres. Brrrm!', 'The tractor came through here. Big wheels!'] },
  milk: { emoji: '🥛', name: 'Milk', xp: 3, lines: ['Milk! Somebody spilt a drop from the churn.', 'Creamy! A cat would love this.'] },
  muck: { emoji: '💩', name: 'The muck heap', xp: 3, lines: ['The muck heap. Phwoar! Wonderful!', 'Pongy! The best kind of pongy.'] },
  straw: { emoji: '🌾', name: 'Straw', xp: 2, lines: ['Straw! Crunchy and golden.', 'A bit of straw. A hen was nesting here.'] },
  wool: { emoji: '🧶', name: 'Tuft of wool', xp: 3, lines: ['A tuft of wool on the fence. Soft!', 'Wool! A sheep squeezed past here.'] },
  windfall: { emoji: '🍎', name: 'Windfall apples', xp: 3, lines: ['Apples on the grass! Wasps love these.', 'Squishy apple. Cidery!'] },
  lamb: { emoji: '🐑', name: 'Lamb', xp: 4, lines: ['A lamb! Tiny, bouncy and brand new.', 'Lamb! Springy little hooves.'] },
  turnip: { emoji: '🥔', name: 'Turnips', xp: 2, lines: ['Turnips. The scarecrow’s cousins.', 'Earthy, crunchy turnips.'] },
  woodsmoke: { emoji: '🔥', name: 'Woodsmoke', xp: 3, lines: ['Woodsmoke from the farmhouse chimney. Cosy!', 'Somebody’s got the fire going.'] },
};
// How often each turns up on the farm (smells from the town's list can turn up here too).
export const FARM_SMELL_WEIGHTS = {
  sheep: 3, hay: 3, pig: 2, hen: 3, egg: 1, tractor: 1, milk: 1, muck: 1, straw: 2, wool: 2, turnip: 1,
  fox: 1, rabbit: 2, mushroom: 1, worm: 1, flowers: 1, ladybird: 1,
};
// …and through the seasons: lambs and blossom in spring, haymaking in summer, pumpkins and windfalls in autumn,
// woodsmoke in winter, worms and puddles in the rain.
export const FARM_SEASON_SMELLS = {
  spring: { add: { lamb: 4, blossom: 2, grass: 2 }, less: { pumpkin: 0.1, mushroom: 0.4 } },
  summer: { add: { hay: 2, strawberry: 2, grass: 3 }, less: { woodsmoke: 0.1 } },
  autumn: { add: { pumpkin: 3, windfall: 3, bonfire: 1, mushroom: 1 }, less: { lamb: 0.1 } },
  winter: { add: { woodsmoke: 3, carrot: 1 }, less: { flowers: 0.1, ladybird: 0.1, wool: 0.6, lamb: 0.1 } },
  christmas: { add: { mincepie: 2 } },
  showers: { add: { worm: 3, puddle: 2 }, less: { hay: 0.5, straw: 0.6 } },
};
