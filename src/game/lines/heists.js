// What the grown-ups guarding the goodies say (heists). {name} = your dog's name, {dog} = whoever did it.

export const BAKER = {
  // Busy with her back to the street, humming away.
  hum: [
    '♪ Do you know the muffin man… ♪', '♪ La la la, lovely dough… ♪', 'Knead, knead, knead…', 'Mmm, smells like Tuesday.',
    '♪ Hot cross buns, hot cross buns… ♪', 'Just a pinch more flour…', 'Rise, little loaves, rise!', 'Who’s a pretty baguette? You are!',
    '♪ Pat-a-cake, pat-a-cake… ♪', 'One for the oven, one for me…',
  ],
  // The warning beat: she's about to look round.
  warn: ['Hmm?', 'Wait a minute…', 'Did I hear something?', 'Hang on…', 'Is someone there?', 'What was that?'],
  // Turned round and watching the stall.
  look: [
    'Just checking on my lovely croissants…', 'All present and correct. I think.', 'No dogs near the buns, please!',
    'Freshly baked, and not for doggies!', 'I’ve got my eye on you, sweet buns.', 'Everything all right out here?',
    'Lovely day for a bun.', 'Hmm. Nothing to see here.',
  ],
  // She turns round and the trays look… emptier.
  missing: [
    'Wait… I’m sure I made twelve.', 'Has someone been at my buns?!', 'My croissants are going walkies!',
    'That tray was FULL a minute ago!', 'Where have all my buns gone?', 'There’s a croissant-shaped gap here…',
    'Somebody’s been nibbling!', 'I count… fewer. Definitely fewer.',
  ],
  // Caught red-pawed: "Oi! Shoo!" (and the treat goes back on the tray).
  caught: [
    'Oi! Shoo! Those are for customers!', 'OI! Put that {treat} DOWN!', 'Shoo! Shoo! Naughty doggy!',
    'That {treat} is NOT for you! Back it goes!', 'I saw that, you cheeky thing!', 'Drop it! DROP IT! Good dog.',
    'Oi! That’s not a dog biscuit!', 'You little pastry pirate!', 'Caught you! Back on the tray!',
    'Oi! Paws off my pastries!', 'Nice try, fluffy!', 'Ha! Not today, crumb-snatcher!',
  ],
  // A dog barking at her door: she turns to see who it is.
  door: [
    'Who’s making that racket?!', 'Ooh! A customer? …Oh. A dog.', 'Is that the delivery? Hello?',
    'Shh! You’ll wake the bread!', 'Yes, yes, I can hear you!', 'Who’s that barking at my door?',
    'What is it? Is someone stuck down a well?', 'Hello? Who’s there? …A doggy!',
  ],
  // Barked at again too soon: she's wise to it.
  wise: ['Not falling for that one again!', 'Nice try. I’m watching my buns.', 'Oh no you don’t!', 'Hmm. Suspicious barking…'],
  // A fresh batch comes out.
  restock: ['Fresh batch, straight out of the oven!', 'Ding! More buns!', 'Lovely and warm, these ones.', 'Right, a whole new tray. Hands off!'],
};

export const BUTCHER = {
  // Busy at his sausage machine, back to the street.
  hum: [
    '♪ Bangers and mash, bangers and mash… ♪', 'Round and round she goes…', 'Lovely bit of pork, that.', 'Mmm. Award-winning, these.',
    '♪ Sausages, sausages, everyone loves sausages… ♪', 'One more turn of the handle…', 'Herbs, a pinch of pepper… perfect.',
    'Best bangers in the county, these.', 'Squish, squish, squish…',
  ],
  warn: ['Eh?', 'Hold up…', 'What was that?', 'Did something move?', 'Hmm…', 'Funny. I heard sniffing.'],
  look: [
    'All my lovely bangers, present and correct.', 'No sniffing round the sausages!', 'I can see you, you know.',
    'Lovely string of sausages, that. Not for dogs.', 'Just admiring my handiwork.', 'Don’t even think about it, pup.',
  ],
  missing: [
    'WHERE ARE MY SAUSAGES?!', 'My bangers! They’ve done a runner!', 'Somebody’s nicked my sausages!',
    'Who’s taken my lovely string?!', 'That rail was FULL of sausages!', 'I’ve been sausage-napped!',
  ],
  caught: [
    'Oi! Put my bangers back!', 'OI! Those are MY sausages!', 'Drop the sausages, sunshine!',
    'Not my prize-winning bangers!', 'Hands off! Er… paws off!', 'Back on the hook, you rascal!',
    'Caught you, sausage snatcher!', 'Oi! Those aren’t chew toys!', 'Ha! Nice try, waggy!',
    'Every day! Every single day!', 'You little sausage thief!', 'Not today, my furry friend!',
  ],
  door: [
    'Who’s barking? We’re closed for lunch!', 'Is that a customer? …It’s a dog.', 'Yes? Can I help you, pup?',
    'Oi! Who’s making that din?', 'Hello? Anyone want some mince?', 'Woof to you too! Now shoo!',
    'What’s all that noise about?', 'Are you after my sausages?',
  ],
  wise: ['I know that trick! Eyes on the sausages.', 'Nope. Not looking. Not falling for it.', 'Bark all you like, pup.', 'Pull the other one!'],
  restock: ['Right! A fresh string. And this time I’m WATCHING.', 'New sausages, just made!', 'Fresh bangers on the hook!', 'There. A lovely new string.'],
  tidy: ['Who left my sausages lying about?!', 'Come here, you lot. Back on the hook.', 'Dropped? On the PAVEMENT?', 'Honestly. Dogs.'],
  tug: ['Ha! Tug of war with my sausages!', 'Pull! PULL! Er… I mean, stop that!', 'Don’t you dare snap my bangers!', 'My sausages are stretching!'],
};

// The BBQ cook mostly watches the grill. "Busy" is when he turns round to chat with the guests.
export const COOK = {
  hum: [
    '…and THEN the deckchair folded up with me in it!', 'Have you tried my special sauce?', 'Ha! No, honestly, it was THIS big!',
    'Who brought the potato salad? Lovely.', 'Is it me, or is it getting cloudy?', 'Did I tell you about my new barbecue tongs?',
    'Don’t worry, it’s meant to be that colour.', 'We had a hedgehog in the garden last week!',
  ],
  warn: ['Hang on, the sausages!', 'Ooh, better check the grill…', 'Is something burning?', 'Mustn’t forget the burgers…', 'Back in a tick…'],
  look: [
    'Who wants a burger?', 'Nearly done! Five more minutes!', 'Sizzle sizzle!', 'Turn, turn, turn…',
    'These are going to be PERFECT.', 'Ketchup or brown sauce, anyone?', 'Not long now, everyone!',
  ],
  missing: [
    'Has anyone seen a sausage? I had three!', 'Where’s that burger gone?!', 'I’m SURE there were more on here…',
    'Somebody’s pinched a sausage!', 'Who’s been at the barbie?!',
  ],
  caught: [
    'Oi! That’s for the guests!', 'Get your nose off my bangers!', 'OI! Put that {treat} back!', 'Shoo! Shoo! Not the barbie!',
    'Ha! Caught you, cheeky chops!', 'That {treat} has someone’s name on it! …Not yours.', 'No dogs at the grill, it’s hot!',
    'Oi! You’ll burn your whiskers!', 'Nice try, sausage-sniffer!', 'Not today, hungry hound!',
  ],
  door: [
    'Aww, look at the doggy!', 'Who’s a good dog? Are you a good dog?', 'Ooh, hello! Did you smell the sausages?',
    'Ha! Party crasher!', 'Someone’s come for a burger!', 'Hello, pup! Come to say hi?',
  ],
  wise: ['Oh no you don’t. I’m watching the grill!', 'Nice try, but the sausages come first!', 'I know that trick, pup!'],
  restock: ['More bangers on the barbie!', 'Next batch, everyone!', 'Another round of burgers coming up!', 'Sizzle! Fresh sausages!'],
  over: ['Right, that’s the lot! Thanks for coming!', 'Party’s over, folks! Mind how you go!', 'Who’s doing the washing up? …Not me!'],
};

// Party guests chat in pairs (the first says one, the second answers).
export const GUESTS = {
  chat: [
    ['Lovely weather for it!', 'Is that a raincloud?'], ['Have you tried the potato salad?', 'Three times!'],
    ['Is it going to rain?', 'It’s a British barbecue. Of course it is.'], ['These sausages smell AMAZING.', 'I know! I can hardly wait.'],
    ['Did you see that dog earlier?', 'Which one? There are LOADS of dogs round here.'], ['Our Kevin’s taken up the bagpipes.', 'Oh dear.'],
    ['I’ve brought a trifle!', 'Ooh! Is there sherry in it?'], ['Mind the wasps!', 'Wasps? WHERE?!'],
    ['Nice garden, this.', 'The gnome’s new, apparently.'], ['What’s the cook’s secret?', 'Burning it. He always burns it.'],
    ['Pass the ketchup?', 'We’ve only got brown sauce.'], ['Who invited the pigeons?', 'Nobody. They just turn up.'],
  ],
  // A guest spots a dog getting away with something (and thinks it's hilarious).
  cheer: ['Ha! Did you SEE that?!', 'That dog’s got a sausage!', 'Cheeky little thing!', 'Run, doggy, run!', 'Ha ha! Go on, pup!', 'Somebody’s having a party of their own!'],
};

// Toasts when a treat gets home safely.
export const GETAWAY = {
  sausage: ['A sizzling sausage, safely home!', 'Hot dog! Er… dog’s hot sausage!', 'Straight off the barbie and into the bowl!', 'Perfectly cooked. Perfectly pinched.'],
  burger: ['A whole burger! Bun, cheese and all!', 'Burger heist complete!', 'The cook will never notice. Probably.', 'One burger, extra cheeky.'],
  links: ['ALL the sausages! The butcher will be furious.', 'A whole string of bangers, safely home!', 'Sausages for tea! All of them!', 'The great sausage heist!'],
  half: ['Half a string of sausages: still sausages!', 'Snapped, but still delicious.', 'Five sausages, all yours!', 'Shared fair and square. Ish.'],
  croissant: ['Croissant stashed! The baker will never know.', 'One croissant, safely home. Ooh la la!', 'Flaky, buttery, and ALL YOURS.', 'A perfect pastry heist!'],
  bun: ['Iced bun safely home! Cherry and all.', 'The bun has left the building!', 'Sticky, sweet and stolen!', 'One iced bun, in the bag. Well, the bowl.'],
};
// Over your dog's head when you grab something and nobody sees.
export const SNEAKY = ['Shh…', 'Tiptoe…', 'Sneaky!', 'Got it!', 'Quick!', 'Nobody saw…'];
// Over your dog's head when you get caught.
export const OOPS = ['Oops!', 'Busted!', 'Eek!', 'Whoops!', 'Rumbled!'];
// Over the dogs in a tug of war.
export const TUG = ['TUG!', 'Grrr!', 'Pull!', 'Heave!', 'Mine!', 'No, MINE!'];
