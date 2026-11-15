// What the neighbourhood friends say. {name} = your dog's name, {item} = the thing to find.

export const GUS = {
  // A job each, for the things he loses (item key from carryables.js; buried: dig it up first).
  jobs: [
    { item: 'squeaky', buried: 3, ask: 'Oh, hello, young pup. I buried my squeaky ball somewhere round here… years ago. Could you sniff it out?' },
    { item: 'slipper', ask: 'I’ve lost my favourite slipper! The comfy one. Could you find it for an old dog?' },
    { item: 'stick', ask: 'My stick! The good stick! Somebody threw it and I’m too slow to fetch it these days.' },
    { item: 'bone', buried: 3, ask: 'I buried a bone for a rainy day. It’s raining in my tummy. Dig it up for me, {name}?' },
    { item: 'ball', ask: 'A tennis ball rolled away and I lost sight of it. My eyes aren’t what they were. Help?' },
  ],
  remind: [
    'Any luck finding my {item}? No rush. I’m not going anywhere. Zzz…',
    'Sniff, sniff! Follow your nose, pup. That’s what I always did.',
    'My {item} is out there somewhere. I can feel it in my ears.',
  ],
  thanks: [
    'My {item}! You found it! You’re a very good dog.',
    'Ahh, that’s the one. Thank you, pup.',
    'Splendid! Back in my day I’d have found it myself. In about a week.',
    'You’ve got a fine nose, {name}. A fine nose indeed.',
  ],
  idle: [
    'Zzz…', '*snore*', 'Back in my day, we chased the milk float.', 'My ears are bigger than your whole head, you know.',
    'Mmm. Sunny spot.', 'Mind how you go, youngster.', 'Is it dinner time? It feels like dinner time.',
  ],
  wake: ['Hm? Wha? Oh! It’s you, {name}.', 'Zzz… snrk! I was just resting my eyes.'],
};

export const DUCHESS = {
  ask: [
    'Oh my feathers! My ducklings have wandered off again! There are three of them. Could you round them up, darling?',
    'Quack! Three little fluffballs, gone exploring! Bring them home to Mummy, would you, {name}?',
  ],
  found: ['Peep!', 'Peep peep!', 'Peep! (It likes you.)'],
  progress: ['That’s {n}! Only {left} more to find!', 'Keep them in a line, dear! {left} to go!'],
  allFound: ['That’s all three! Bring them back to me, darling!', 'All my babies! Now, home to the pond, please!'],
  thanks: [
    'My babies! All three! You are an absolute treasure.',
    'Thank you, darling! Quack quack hooray!',
    'What a splendid dog. Everyone, say thank you to {name}! (Peep peep peep!)',
  ],
  remind: ['Have you seen my ducklings? Three little fluffballs…', 'Do look behind the hedges, dear. They love hedges.'],
  idle: ['Quack.', 'Lovely day for a paddle.', 'Do mind the reeds, dear.', 'One must always look one’s best.', 'Quack quack. That means hello.'],
};

export const BOARD = {
  // Lost & found posters (item key, and how it's described).
  posters: [
    { item: 'teddy', text: 'LOST: one teddy bear, much loved. Please bring him home!' },
    { item: 'sock', text: 'LOST: a pink sock. Very stinky. Still wanted!' },
    { item: 'newspaper', text: 'WHERE is my newspaper?! The paper boy says he delivered it…' },
    { item: 'frisbee', text: 'LOST: orange frisbee. Last seen flying over a hedge.' },
    { item: 'ball', text: 'LOST: tennis ball. Belongs to a very sad little boy.' },
    { item: 'slipper', text: 'Has anyone seen my purple slipper? I only have the left one now.' },
  ],
  read: '📋 Follow the glowing paw prints to take it home!',
  thanks: [
    'My {item}! Thank you, good dog!', 'Oh, you clever dog! Thank you so much!', 'Who’s a helpful pup? You are!',
    'Look, everyone! The dog found my {item}!', 'Thank you! Here, have a pat. Pat pat pat.',
  ],
};
