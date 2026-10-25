# Go Slow Lagos (Stage 1)

A real Lagos map with live traffic that detects jams automatically. Nobody has to post anything.

## 1. Get your free TomTom key (5 minutes)
1. Go to https://developer.tomtom.com and click Sign up. Use your email and confirm it.
2. After you log in, open Dashboard, then Keys. A key called "My first API key" is already there.
3. Make sure the key has Traffic API turned on (tick all the Traffic options).
4. Copy the key.

## 2. Put the key in the app
Open `config.js` in any text editor (Notepad works). Replace `PASTE_YOUR_KEY_HERE` with your key, keep the quotes, and save.

## 3. Put it online for free
1. Go to https://app.netlify.com/drop and sign up (free).
2. Drag the whole `go-slow` folder onto the page.
3. Netlify gives you a web address. Open it on your phone.
4. On Android Chrome, tap the menu and choose "Install app" or "Add to Home screen".

## 4. Lock your key to your site (important)
Once your address is live, go back to TomTom, Dashboard, Keys, and set your key to only work from your site address. That stops other people using up your free allowance.

## What to check
- Do red, orange and green lines show on the Lagos roads?
- Do the route cards show a status (Clear, Slow, Heavy) and real speeds?
- Tap a road on the map. Does it tell you the speed?
- Does the Incidents tab find anything?
Send me what you see, including any error text in the cards. That tells me how well TomTom covers Lagos.

## Known limits of Stage 1
- Route checks run in each person's own phone, and the free TomTom allowance is shared by everyone. That is fine for testing with a few people. Stage 2 moves the checks to a server that asks TomTom once and shares the answer with everyone.
- The street map uses the free OpenStreetMap servers, which is fine to start but not for very large numbers of users.
