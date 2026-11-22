// What the town dogs say (see ../crew/townDogs.js). {name} = your dog's name, {other} = another town dog,
// {treat} = a tasty thing, {trick}/{did}/{want} = tricks, {n}/{left} = how many.
// Every dog has hello, idle, ask, later, busy, about and win, plus the lines for its own game.

export const PAL_EMOJI = {
  biscuit: '🍪', noodle: '🌭', barnaby: '🐻', tank: '🛡️', pebble: '🪨',
  sprout: '🌱', zip: '⚡', willow: '🍃', fern: '🌿', bonnie: '🎀',
};

/** Anything a dog hasn't got its own line for. */
export const ANY = {
  hello: ['Oh! Hello!', 'A new dog! Hello, new dog!', 'Hi, {name}!'],
  idle: ['Nice day for it.', '*wag wag*', 'Smells good round here.'],
  ask: ['Want to play?'],
  later: ['Let’s play another time!', 'Phew! Later, maybe?'],
  busy: ['You’re playing with {other}! Come and find me after.'],
  about: ['Have you met {other}? Lovely dog. Bit odd.'],
  win: ['That was brilliant! Can I come with you?'],
  remind: ['Go on! You can do it!'],
  nearly: ['Ooh, nearly!'],
};

export const PAL_LINES = {
  // 🍪 Biscuit the beagle, in the park: hide-and-seek. Nose first, always.
  biscuit: {
    hello: ['Sniff sniff… a NEW smell! Hello, new smell! Oh, you’re a dog.', 'Hello! You smell of adventures. And a bit of bin.', 'Oh hi! I’m Biscuit. I’m mostly nose.'],
    idle: [
      'I can smell a sausage roll. It’s in Wales.', 'This patch of grass has had SEVENTEEN dogs on it today.', 'Sniff. Sniff. Sniiiiiff. Yep, that’s a worm.',
      'My ears are for scooping smells into my nose. True fact.', 'Somebody had a cheese sandwich on that bench. Tuesday, I think.', 'I once followed a smell for a whole afternoon. It was me.',
      'Do you play hide-and-seek? I’m AMAZING at hiding. Mostly.', 'Squirrel. Squirrel. Pigeon. Squirrel. Crisp.',
    ],
    ask: ['Hide-and-seek! I’ll hide, you seek! Close your eyes and count to five!', 'Ooh, ooh! Play hide-and-seek with me? I’m going to hide SO well. Count to five!', 'Bet you can’t find me! Use your nose! Ready? Count to five!'],
    giggle: ['hee hee!', '*wag wag*', '*snuffle*', 'hee!', '*rustle*', 'shh!'],
    nearly: ['Oh no, you’re close! Don’t look over here!', 'Getting warmer…', 'Shh! I’m not here!'],
    found: ['You found me! Again! Count to five!', 'Ha! Your nose is nearly as good as mine! One more!', 'Found me! {left} more go. I’m hiding even better this time!'],
    win: ['Your nose is BRILLIANT! Can I come with you? We could sniff everything!', 'Three times! You’re the best seeker ever. Let’s be pals!'],
    later: ['Aww. Let’s play again later! I’ll be right here. Hiding. Probably.', 'Off you go then! Hide-and-seek another time!'],
    busy: ['You’re playing with {other}! Come back after and find me!', 'Busy? I’ll practise hiding. Don’t look.'],
    about: ['{other} smells of… hm… biscuits? No, that’s me.', 'I can smell {other} from here. Hello, {other}!', '{other} hid once and I found them in three seconds. By smell.'],
  },

  // 🌭 Noodle the sausage dog, on bakery street: a treat. Long, low, and always hungry.
  noodle: {
    hello: ['Oh! Hello! You haven’t got a sausage, have you? No? Oh well. Hello anyway!', 'Hi! I’m Noodle. Do you smell that bakery? I smell it all day. It’s torture.', 'A visitor! Have you eaten? I have. But not recently.'],
    idle: [
      'The bakery throws out the broken biscuits at four. I’m always here at four.', 'My tummy’s rumbling. My tummy is always rumbling.', 'I am a sausage dog. I am not a sausage. People get confused.',
      'If I lie very still, sometimes a crumb falls on me.', 'Mmm. Warm bread. I can smell it through my eyebrows.', 'My back end is still round the corner. It’ll catch up.',
      'I had a croissant once. Best day of my life.', 'The baker calls me “that long dog”. I call her “the kind lady with the buns”.',
    ],
    ask: ['Psst! I’m SO hungry. Could you find me a {treat}? I think I smelled one over that way…', 'Help! I need a {treat}. Urgently. It’s a snack emergency!', 'You look like a dog who could find a {treat}. For a friend. The friend is me.'],
    remind: ['Any luck with that {treat}? My tummy’s asking.', 'The {treat}! Don’t forget the {treat}!', 'Still hungry over here! Still very long and very hungry!'],
    nearly: ['Is that… is that a {treat}?! Bring it here! Bring it here!', 'I can SMELL it! Over here! Over here!'],
    win: ['Om nom nom! That was delicious! You’re my favourite dog. Can I come with you? I’ll find snacks!', 'Mmmff! Best. Snack. Ever. Let’s be pals! Pals share snacks!'],
    later: ['Oh well. I’ll just lie here and think about sausages.', 'Never mind! Bring me a snack another time!'],
    busy: ['Playing with {other}? Bring me a crumb after!', 'Go on, play with {other}. I’ll guard these smells.'],
    about: ['{other} never shares snacks. Not once.', 'Have you met {other}? Nice dog. Not edible.', '{other} says I eat too much. {other} is wrong.'],
  },

  // 🐻 Barnaby the Bernese, by the pond: fetch his stick out of the water. Big, gentle, and NOT a swimmer.
  barnaby: {
    hello: ['Oh, hello there, little one. I’m Barnaby. Mind the pond, it’s very wet.', 'Hello! Lovely to meet you. Don’t worry, I’m big but I’m gentle.', 'Ah, a new friend! I’m Barnaby. Big paws, big heart, hates baths.'],
    idle: [
      'Water is for drinking. Not for being IN.', 'The ducks laugh at me, you know. I can tell.', 'I’m very fluffy. If I get wet I weigh as much as a sofa.',
      'Duchess says I should learn to swim. I say Duchess should learn to bark.', 'Lovely day for sitting next to a pond. Not in it. Next to it.', 'I could give you a leg-up, you know. I’m practically a step.',
      'I like to sit very still and be a hill. Hedgehogs climb on me.', 'Hmm. A frog just looked at me funny.',
    ],
    ask: ['Oh dear, oh dear. My stick’s gone in the pond and I don’t DO water. Could you fetch it for me?', 'Little one! Could you be a hero? My stick’s floating out there and I’m a terrible swimmer.', 'I’ve dropped my stick in the pond. Again. Would you swim out and get it? I’ll cheer!'],
    cheer: ['Go on! Paddle paddle!', 'You’re a natural! Keep going!', 'Brave dog! Very brave!', 'Ooh, you’re so good at that!'],
    nearly: ['You got it! Bring it back! Bring it back!', 'Hooray! Over here! I’m the big fluffy one!'],
    again: ['Oh! Oops. I flung it in again. My head’s just so big. One more?', 'Thank you! Oh no… it slipped. Sorry! Just once more?'],
    remind: ['It’s out there! Floating! Mocking me!', 'The water’s lovely, apparently. I wouldn’t know.'],
    win: ['My hero! Little ones like you are the bravest. May I come along? I can give you a leg-up to all sorts!', 'Thank you, thank you! You know, I think we should be pals. I’ll be your step-ladder!'],
    later: ['Never mind. The stick will float back one day. Probably.', 'Another time, little one. I’ll be here. Dry.'],
    busy: ['Busy with {other}? That’s all right. I’ll be here, being a hill.', 'Off you go and play with {other}. I’ll mind the pond.'],
    about: ['{other} jumped in the pond once. On purpose! I had to lie down.', 'Have you met {other}? Bit bouncy for me, but very sweet.', '{other} likes to sit on me. I don’t mind. I’m comfy.'],
  },

  // 🛡️ Tank the Staffy, stuck in a garden: dig him out under his gate. All heart, no jump.
  tank: {
    hello: ['HELLO! HELLO! Over here! Behind the gate! It’s me! Tank!', 'Oh wow, a dog! Out THERE! In the world! Hello!', 'Hiya! I’m Tank! I’m stuck! But I’m happy! Mostly stuck!'],
    idle: [
      'I’ve been round this garden four hundred times. It’s still the same garden.', 'One day I’ll see what’s past that gate. One day!', 'My legs are built for hugging, not for jumping.',
      'Is it nice out there? It looks nice out there.', 'I said hello to a pigeon. It left.', 'I can hear the park from here. Sounds brilliant.',
      'I dug a hole in the lawn once. Got told off. Worth it.', 'My people are lovely. They just keep the gate shut.',
    ],
    ask: ['Can you help me get out? There’s loose soil just outside the gate. If you dig your side and I dig mine…', 'Psst! Escape plan! You dig under the gate from out there, I squeeze through! Ready?', 'I need an adventure! Dig me out under the gate? There’s a soft bit by your paws!'],
    inside: ['You got IN! You’re amazing! But I can’t jump like that. Dig me out from the street side!', 'Whoa, you jumped it! My legs just don’t do that. Dig under the gate from outside!'],
    remind: ['The soft soil! Just outside the gate! Dig dig dig!', 'I’m digging my side! Are you digging yours?', 'Freedom is just a few digs away!'],
    dug: ['Yes! Keep going! I can see daylight! Well, mud. Daylight-coloured mud!', 'Dig dig dig! It’s working!'],
    free: ['I’M OUT! I’m out I’m out I’m OUT!', 'The world! It’s so BIG!'],
    win: ['You dug me out! You’re my best friend in the whole world! Can I come with you? Please please please?', 'Freedom! And a pal! Best day EVER! Where are we going?'],
    later: ['That’s OK! I’ll be here. Behind the gate. Being patient. Very patient.', 'Come back soon! I’ll keep digging my side!'],
    busy: ['You’re playing with {other}? Lucky {other}! Come back for me after!', 'Go play with {other}! I’ll wait! I’m good at waiting! Sort of!'],
    about: ['I can hear {other} from here! HELLO {other}!', 'Is {other} nice? Everyone out there sounds nice.', 'I bet {other} has seen the whole town. I’ve seen this lawn.'],
  },

  // 🪨 Pebble the pug, down the alley: copy her tricks. A small dog with a big act.
  pebble: {
    hello: ['Oh! An audience! Hello, darling!', 'Hello, hello! I’m Pebble. You may have heard of me. No? You will.', 'A visitor! Quick, everyone look natural. Oh, it’s just me here.'],
    idle: [
      'I know every trick there is. And some there isn’t.', 'Snort. Snort. That’s pug for “good afternoon”.', 'These bins are my stage. The cats are my critics.',
      'I did a backflip once. Well, a back-flop.', 'I’m not snoring, I’m humming. There’s a difference.', 'The secret to a good trick is a good face. And I have the BEST face.',
      'Applause is my favourite snack. After actual snacks.', 'I can roll over in under two seconds. Watch. Actually, later.',
    ],
    ask: ['Darling! Let’s play copycat! I do a trick, you do the same trick. Ready?', 'You look like a dog with talent. Copy my tricks, if you can! Ready?', 'Showtime! I’ll show you a trick, you copy it. Easy peasy, pug squeezy!'],
    watch: ['Watch this!', 'Ta-daaa…', 'Eyes on me, darling!', 'Ready? Watch!'],
    your: ['Your turn! {trick}!', 'Now you! {trick}!', 'Go on, then! {trick}!'],
    right: ['Bravo! Bravissimo!', 'Ooh, you’re good! Next one!', 'Perfect! You’re a natural!'],
    wrong: ['Ooh, that was {did}! Lovely, but I did {want}!', 'Close! But it was {want}. Try again, darling!', 'Ha! {did}! Very nice. Now do {want}!'],
    far: ['Come closer, darling, I can’t see you from there!', 'Over here! I need to see it!'],
    win: ['Magnificent! A star is born! Will you come with me? We could put on a show!', 'You copied EVERYTHING! You’re a superstar. Pals? Pals!'],
    later: ['The show must go on! But later. Toodle-oo!', 'Another time, darling. I need a nap. Being brilliant is tiring.'],
    busy: ['Playing with {other}? Fine, fine. I’ll rehearse.', 'Go on, then. Come back when {other}’s done. I’ll be fabulous.'],
    about: ['{other} tried to copy my roll-over once. Bless.', '{other} is lovely, but no stage presence.', 'Have you met {other}? Ask them about my backflip. Actually, don’t.'],
  },

  // 🌱 Sprout the Chihuahua, round the streets: catch him. Tiny, quick, and very pleased with himself.
  sprout: {
    hello: ['Oi! Hello! I’m Sprout! I’m FAST!', 'Hiya! Bet you can’t catch me! Not yet, I mean. I’m just saying hello.', 'Whoa, you’re big! I’m small! But fast!'],
    idle: [
      'I’ve been round this block a hundred times today. Hundred and one!', 'Zoom zoom zoom.', 'Nobody can catch me. Nobody! Well, the postman, once. He had a bike.',
      'I’m small but my legs go really fast.', 'I chased a leaf for ten minutes. I won.', 'Brrr. Chilly. Better run about a bit.',
      'I barked at a bus yesterday. It went away. I’m very scary.', 'Speedy is my middle name. My first name is Sprout.',
    ],
    ask: ['Bet you can’t catch me! Ready… steady… ZOOM!', 'Tag! Catch me if you can! Go!', 'Race you round the block! Well, chase me round it! Go go go!'],
    during: ['Too slow!', 'Nyah nyah!', 'Can’t catch me!', 'Wheee!', 'Over here! No, over HERE!'],
    puff: ['Phew… hang on… puff…', 'Ooh, stitch…', 'Puff… puff… just a sec…'],
    win: ['You caught me! Nobody EVER catches me! Can I come with you? I’ll be your speedy pal!', 'Ha! Got me! You’re fast! Let’s be pals and be fast together!'],
    later: ['Ha! Too quick for you! Catch me another time!', 'Phew! I’m off! Try again later, slowcoach!'],
    busy: ['Playing with {other}? I’ll do a lap while I wait. Or twelve.', 'Hurry up with {other}! I’m bored! I’ll run about!'],
    about: ['{other} is fast. Not as fast as me. Nobody’s as fast as me.', 'I ran past {other} three times this morning. They didn’t notice.', 'Have you met {other}? Nice. Slow. Nice.'],
  },

  // ⚡ Zip the collie, at the farm: a race. Busy, bright, and herds everything.
  zip: {
    hello: ['Hello! Hello! Are you here to help? There’s lots to do! Sheep to count! Hens to tidy!', 'Oh! A visitor! Wait there. Don’t move. I’m herding you. Sorry, habit.', 'Hi! I’m Zip! I’m the fastest dog on the farm! The ONLY dog on the farm, but still!'],
    idle: [
      'Sixty-three sheep. Sixty-four. Sixty… oh, you moved.', 'The tractor won’t race me any more. I think it’s scared.', 'I like to keep busy. Busy busy busy.',
      'If you stand still too long, I’ll round you up. Can’t help it.', 'The hens are SO untidy. Look at them. All over the place.', 'Farmer Mabel says I’m a good girl. I am a very good girl.',
      'I race the wind every morning. Sometimes the wind wins.', 'Look at that field. Perfect for running in circles.',
    ],
    ask: ['Race you! Round the flag and back! Woof when you’re ready!', 'Bet I can beat you to that flag and back! Woof to start!', 'You look fast. Want a race? Round the flag, back to here! Woof when you’re ready!'],
    remind: ['Woof when you’re ready! I’m ready! I was born ready!', 'Come on! The flag’s waiting! Woof to start!'],
    ready: ['Ready… steady…', 'On your marks…'],
    lead: ['Catch me if you can!', 'Wheee!', 'Nearly there!'],
    behind: ['Whoa, you’re quick!', 'Hey! Wait for me!', 'Ooh! Speedy!'],
    iwon: ['I win! Again? Woof when you’re ready!', 'Ha! Close one! Rematch? Woof!', 'Yes! But you’re getting faster! Woof to go again!'],
    win: ['You beat me! You BEAT me! Nobody beats me! Can I come with you? I can herd for you!', 'Wow! What a race! You’re fast. Let’s be pals! I’ll keep everybody in a neat line!'],
    later: ['Off you go! I’ve got sheep to count anyway!', 'Race you another time! I’ll be practising!'],
    busy: ['Busy with {other}? I’ll count the sheep again.', 'Finish with {other}, then race me!'],
    about: ['{other} would make a good sheep. Very fluffy.', 'I tried to herd {other} once. It went badly. For me.', 'Have you raced {other}? I bet I’d win.'],
  },

  // 🍃 Willow the greyhound, on the beach: a race on the sand. Elegant, dreamy, and quick as anything.
  willow: {
    hello: ['Oh, hello. Isn’t the sea marvellous? I could look at it for hours. Then run along it for hours.', 'Hello there. I’m Willow. I do like a long run on the sand.', 'Ah! A new face. How lovely. Do you run?'],
    idle: [
      'The sand’s just right for running today. Firm, but kind.', 'Have you ever run so fast your ears go flat? Bliss.', 'I like the sea. It’s always going somewhere.',
      'People think greyhounds are always running. We mostly lie on sofas. But when we run…', 'The seagulls race me sometimes. They cheat. They fly.', 'Mmm. Salty breeze.',
      'I once ran from the lighthouse to the rock pools before a wave came in. Twice.', 'A good stretch, a good run, a good nap. That’s the day sorted.',
    ],
    ask: ['Fancy a race? Round the flag and back, along the sand. Woof when you’re ready.', 'Oh, you look quick! Race me round that flag? Woof to start.', 'Shall we run? Round the flag and back. Woof when you like.'],
    remind: ['Whenever you’re ready. Just woof.', 'The flag’s out there. Woof and we’re off.'],
    ready: ['Ready…', 'On your marks…'],
    lead: ['Lovely day for it!', 'Wheee…', 'Feel that breeze!'],
    behind: ['Oh! My word, you’re fast!', 'Goodness!', 'Wait for me!'],
    iwon: ['Ooh, that was close! Again? Just woof.', 'Hooray! But you’re ever so quick. Once more? Woof!', 'What fun! Rematch? Woof when you’re ready.'],
    win: ['You beat me! How wonderful. I think we should be pals. Shall I come with you?', 'Marvellous running! May I come along? I’d love to see the town.'],
    later: ['Another time, then. The beach will wait. So will I.', 'Off you go. I’ll have a little lie down.'],
    busy: ['Playing with {other}? No hurry. I’ll watch the waves.', 'Come back when you’re done with {other}. I’ll be here.'],
    about: ['{other} came to the beach once and dug a hole to Australia. Nearly.', 'Have you met {other}? Such a sweet dog.', 'I raced {other} along the sand. Well, I raced. {other} sat down.'],
  },

  // 🌿 Fern the husky, in the woods: howl along. Wild at heart, sings to the trees.
  fern: {
    hello: ['Oh! A visitor in the woods! Hello! Awoo!', 'Hello, friend! I’m Fern. The trees and I were just having a sing.', 'Awoo! Oh, sorry. That’s husky for “hello”.'],
    idle: [
      'The owl joins in sometimes. Hoo-awoo! It’s lovely.', 'I sing to the trees. They don’t sing back. Yet.', 'Snow is my favourite. Snow and howling. And snow.',
      'Can you hear the woods? Every leaf is talking.', 'I live out here because the echo is AMAZING.', 'Awoo-woo-woo. Just warming up.',
      'Brock the badger says I’m too loud. Brock is asleep, so how would he know?', 'My ancestors pulled sleds across the snow. I pull sticks across the den. Same thing.',
    ],
    ask: ['Will you howl with me? I howl, you howl back! It sounds SO good in the woods!', 'Sing with me! I’ll howl, then you howl. Ready?', 'Let’s make the trees ring! Howl when I howl!'],
    your: ['Your turn! Howl! 🐺', 'Now you! Awoo!', 'Go on, give it a howl!'],
    right: ['AWOO! Beautiful!', 'Ooh, lovely howl! Again!', 'That gave me shivers! Again!'],
    together: ['Now together! Ready… one, two…', 'Last one together! One… two…'],
    again: ['Not quite together! Let’s try again!', 'Ooh, so close! Again! Together!'],
    win: ['AWOOOO! That was perfect! The whole wood heard us! Can I come with you? We can sing everywhere!', 'What a song! We’re a choir now. Pals? Pals! Awoo!'],
    later: ['Another time! I’ll keep practising. Awoo…', 'Bye for now! Come back and sing!'],
    busy: ['Singing with {other}? No? Playing? Come back and howl after!', 'Off with {other}? The woods will wait!'],
    about: ['{other} can’t howl. They sort of… squeak. It’s sweet.', 'I taught {other} to howl. Well, I tried.', 'Have you met {other}? I bet they’d love the woods.'],
  },

  // 🎀 Bonnie the golden retriever, in the park: fetch. Sunny, sweet, and absolutely obsessed with balls.
  bonnie: {
    hello: ['Hello! Hello! Do you like balls? I LOVE balls! Hello!', 'Oh, hi! I’m Bonnie! Have you got a ball? I’ve got a ball!', 'A friend! Want to see my ball? It’s the best ball!'],
    idle: [
      'Ball. Ball ball ball. Ball?', 'I’ve had this ball since Tuesday. It’s my best friend. After you, maybe!', 'Throw it! Throw it! …Oh, nobody’s here.',
      'I could play fetch until the stars come out. Then I’d fetch the stars.', 'My tail goes this fast all the time. It’s exhausting. It’s brilliant.', 'Every ball is the best ball.',
      'Gus says I’m too bouncy. Gus is a bit flat, though.', 'Did you know a ball goes further if you believe in it?',
    ],
    ask: ['Fetch! Fetch! You can’t throw, can you? That’s OK, I’ll throw it! You fetch!', 'Want to play fetch? I’ll throw, you fetch! Three times! Ready?', 'Ooh, ooh, FETCH? I’ll flick it, you bring it back!'],
    throw: ['Fetch!', 'Go get it!', 'Wheee!', 'There it goes!'],
    good: ['Good dog! Again!', 'Yay! Again again again!', 'You’re SO good at this! Once more!'],
    win: ['That was the best game of fetch EVER! Can I come with you? I’ll bring the ball!', 'Three fetches! You’re amazing! Let’s be pals forever and ever!'],
    later: ['Aww. OK! Fetch later! I’ll keep the ball warm!', 'Bye! Come back for fetch!'],
    busy: ['Playing with {other}? Bring them for fetch after!', 'Go on, play with {other}! I’ll hold the ball. I’m good at holding the ball.'],
    about: ['{other} doesn’t really get fetch. They just look at the ball.', 'Have you met {other}? They’re lovely! I offered them my ball!', 'I bet {other} would play fetch if they tried.'],
  },
};
