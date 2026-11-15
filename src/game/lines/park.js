// What the park friends say. {name} = your dog's name. Lines starting "Nut:" or "Meg:" are said by
// that twin (the other one's busy giggling).

/** 🐿️ Nut & Meg: squirrel twins. Nut is giggly and acorn-mad; Meg is clever, bossy and very competitive. */
export const SQUIRRELS = {
  idle: [
    'Nut: Nuts! Nuts! NUTS!', 'Meg: Hello, {name}! Have you come to play?', 'Nut: I’ve got an acorn in each cheek. Wanna see? Mmmf.',
    'Meg: Nut buried forty acorns. He remembers where three of them are.', 'Nut: Dogs can’t climb trees. That’s just science.',
    'Meg: I’m the clever twin. Nut’s the… other one.', 'Nut: Is that a tail or a fluffy carrot?', 'Meg: Hide and seek? HIDE AND SEEK?',
    'Nut: I’m not hyper. I’m just VERY EXCITED ABOUT EVERYTHING.', 'Meg: Shh! Nut! Act natural!', 'Nut: Squirrel! Oh wait, that’s me.',
    'Meg: We were born in that tree. Well, the one next to it.', 'Nut: Chitter chitter chitter! (That’s squirrel for hello.)',
  ],
  ask: [
    'Nut: Hide and seek! Hide and seek! YOU count!', 'Meg: Let’s play hide and seek! You close your eyes and count to ten!',
    'Nut: Bet you can’t find us! Nobody EVER finds us!', 'Meg: Round {round}! This time we’re hiding REALLY well.',
  ],
  count: ['One… two… three… (no peeking!)', 'Eight… nine… TEN! Ready or not!', 'Count to ten… or seven… seven’s fine.'],
  // Giggles drifting out of a tree when you're close (but they're not telling which one).
  tease: ['Hee hee hee!', 'Nut: Shh! It’s coming!', 'Meg: Don’t move a whisker…', 'Nut: *muffled giggling*', 'Meg: Cold! Colder! Freezing!', 'Nut: I can see your nose!'],
  found: {
    nut: ['Aww! You found me!', 'Hee hee! How did you know?!', 'Nut-tastic sniffing!', 'Found me! Was it my tail? It’s always my tail.', 'Eek! Hee hee hee!'],
    meg: ['WHAT?! How did you find me?!', 'Not fair! Your nose is too good!', 'Hmph. Beginner’s luck.', 'Oh, well DONE, {name}!', 'Fine. You found me. Fine!'],
  },
  again: { nut: ['But you can’t catch me twice! Wheee!', 'Bet you can’t find me AGAIN!'], meg: ['Best of two! Count again!', 'That one didn’t count! Hide again!'] },
  waiting: ['Nut: Go on, find Meg! She’s rubbish at hiding.', 'Meg: Find Nut! He’s probably eating his hiding place.', 'Nut: Hot! Hotter! No, colder.', 'Meg: Keep sniffing, {name}!'],
  wrong: [
    'Nobody up here but us leaves!', '*a conker bonks you on the head* Ow.', 'Wrong tree! (said a very cross blackbird)',
    'Tweet? (It’s just a robin.)', '*rustle rustle* …it was the wind.', 'Not this one! Try sniffing!', 'Just an old nest in here.',
    'Hoo? (An owl. A very sleepy owl.)', 'Empty! Unless you count the caterpillar.',
  ],
  allFound: ['Nut: You found us both! Again! Again!', 'Meg: OK, OK, you’re good at this.', 'Nut: Best seeker in the whole park!', 'Meg: Our turn to count next time. (Not really.)'],
  thanks: [
    'Meg: That was the best game EVER. Well, since breakfast.', 'Nut: Here, have an acorn! …Actually, I’ll keep it for you.',
    'Meg: You’re a very good finder, {name}.', 'Nut: Come back and play again soon, OK? OK? OK?',
  ],
  bored: ['Nut: Where did {name} go? …Boring!', 'Meg: Fine, we’ll play hide and seek with Gus. (He’s asleep.)'],
};

/** 🦔 Pepper: a shy, polite little hedgehog, very fond of flowers (and slugs), very scared of the mower. */
export const PEPPER = {
  idle: [
    'Snuffle snuffle.', 'Oh! A big dog! …A nice big dog?', 'I’m not prickly. Well, I am. But I’m nice.', 'Mmm. Worms.',
    'Have you seen any slugs? Asking for a friend. The friend is me.', 'Is it night yet? I’m a night-time sort of hedgehog.',
    'Hello, {name}! Lovely leaves today.', 'I’ve got 5,000 prickles. I counted. Twice.', 'Shh. I think I heard the mower.',
  ],
  ask: [
    'Excuse me, big dog… would you walk me to the flowerbeds? That roaring grass monster frightens my prickles off!',
    'Oh, {name}! Could you take me to the flowers? Slowly, please. I have very little legs.',
    'Will you be my bodyguard? Just to the flowerbeds. The mower’s about.',
    'Flowerbeds, please! I’ll follow you. Don’t go too fast — I’m a hedgehog, not a hare.',
  ],
  walk: [
    'Pitter patter, pitter patter…', 'Are we nearly there?', 'This is the furthest I’ve ever walked! (It isn’t.)',
    'Ooh, a beetle! No — focus, Pepper.', 'You’re a very good bodyguard.', 'Is that the mower? It’s a leaf. Phew.',
  ],
  wait: ['Wait for me!', 'Not so fast! Little legs!', 'Hello? Big dog? Where did you go?', 'Slow down, {name}!'],
  scared: ['EEK! The grass monster!', 'Eep! Ball mode!', 'I’m a pinecone! I’m just a pinecone!', 'Nobody here but us prickles!', '*curls up and trembles*'],
  phew: ['Is it gone? …It’s gone.', 'Phew!', 'Right. Where was I?', 'I wasn’t scared. I was… resting. In a ball.'],
  thanks: [
    'Flowers! And slugs! I mean… lovely flowers!', 'You’re the bravest dog I know, {name}.', 'Thank you! Have a prickle. No? Fair enough.',
    'Home sweet flowerbed! Thank you, big dog.', 'I’m going to tell all the other hedgehogs about you.',
  ],
  giveUp: ['I’ll wait at home, then…', 'Oh. I’ll just… go home. Come back soon!'],
};

/** 🤖 Mowbot, the park's robot lawnmower: SPEAKS IN CAPITALS. Loves grass. Means well. */
export const MOWER = {
  patrol: [
    'BEEP. MOWING. MOWING.', 'GRASS: FOUR CENTIMETRES. UNACCEPTABLE.', 'HELLO, DOG. I AM MOWBOT. I AM YOUR FRIEND.',
    'WHIRR. CHOMP. NEAT.', 'STRIPES. I LOVE STRIPES.', 'BEEP BOOP. NICE DAY FOR MOWING.', 'DAISY DETECTED. SPARING DAISY.',
  ],
  curious: ['BEEP? SMALL CACTUS DETECTED.', 'HELLO, SMALL SPIKY FRIEND!', 'IS THAT A PINECONE? I MUST INSPECT.', 'NEW FRIEND? BEEP BEEP!'],
  shooed: ['BEEP! SORRY! REVERSING!', 'OKAY, OKAY! MOWING ELSEWHERE!', 'WOOF RECEIVED. RETREATING.', 'BOOP. MESSAGE UNDERSTOOD.'],
  blocked: ['EXCUSE ME. YOU ARE NOT GRASS.', 'BEEP BEEP. PLEASE MOVE, FLUFFY OBSTACLE.', 'OBSTACLE: WAGGY. WAITING.'],
};
