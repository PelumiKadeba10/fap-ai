# Airplane-mode test checklist

Run this on a real phone before the event. About 20 minutes. Do it with a **test event**, not the live one.

## Before you start

- [ ] The site is the **production build** on https (the deployed site, or `npm run build` then `npm start`). Offline pages do not work in `npm run dev`.
- [ ] Test event has: one collection point, one bus link, one trip with 2 stops that is ready to go, one pledged pick-up.
- [ ] Test on **Android Chrome** and **iPhone Safari** if you can. Repeat the sections below on each.
- [ ] Open the three links **once with signal**: the collection point link, its Pick-ups tab, and the bus link. Wait 5 seconds on each. (This is what saves the page for offline use.)
- [ ] Have the coordinator screens (Intake, Live) open on a laptop to check what arrives.

## 1. Page opens with no signal

- [ ] Turn on airplane mode.
- [ ] Close the browser tab completely, then open each of the three links again from history or bookmarks.
- [ ] Each page loads and shows its form or trip. (Yellow "No signal" note appears.)
- [ ] A link you never opened with signal shows the plain "offline and not saved yet" message (expected).

## 2. Report food, offline

- [ ] Fill in food and number of boxes/cartons, add a photo, tap **Send**.
- [ ] A yellow "Saved on this phone" message appears, and the report is listed under "Saved on this phone, not sent yet". The form is cleared.
- [ ] Send a second report the same way. Both are listed, in order.
- [ ] Reload the page (still offline). Both reports are still listed.
- [ ] Fully close the browser and reopen the link (still offline). Both are still listed.
- [ ] Turn airplane mode off. Within about 20 seconds both disappear from the list and show under "Your last sends".
- [ ] On the laptop, Intake shows **exactly 2** new batches (not 3 or 4), with the right food, counts and photos.

## 3. Pick-ups, offline

- [ ] Airplane mode on. Tap **On my way**. The button disappears and the card shows it is saved on this phone.
- [ ] Enter packs and tap **Picked up**. The card shows "Saved on this phone: Picked up ...".
- [ ] Switch to the **Report food** tab and back. The saved taps are still listed.
- [ ] Airplane mode off. Within about 20 seconds the card shows the real status (Picked up), and the list is empty.
- [ ] On the laptop: the pick-up creates one pending batch, with the right packs. The pick-up time is the time you tapped, not the time signal came back.

## 4. Bus trip, offline

Write down the clock time of each tap.

- [ ] Airplane mode on. Tap **Loaded, leaving now**. The stop buttons appear straight away and the waiting list shows "Left the collection point".
- [ ] Tap **Delivered here** on stop 1. Stop 1 turns green, stop 2 becomes the next stop.
- [ ] Tap **Problem at this stop** on stop 2. It shows Problem.
- [ ] Tap **Delivered here** on stop 2 anyway. It turns green and **Back at collection point** appears.
- [ ] Tap **Back at collection point**. A "Saved" message appears.
- [ ] Wait 3 minutes (so tap times and arrival times are clearly different), then airplane mode off.
- [ ] Within about 20 seconds the waiting list empties and the page moves on (next trip or "Free").
- [ ] On the laptop, Live/Trips shows the trip as returned. Departure, delivery and return times match the **times you wrote down**, not the time signal returned.

## 5. A tap the server refuses

- [ ] Start a second test trip. Airplane mode on. Tap **Loaded, leaving now**.
- [ ] On the laptop, cancel that trip.
- [ ] Airplane mode off. The tap stays in the yellow list with a red reason ("This trip was cancelled") and a **Discard** button. It does not vanish.
- [ ] Tap **Discard**. It is removed.

## 6. Weak or flaky signal

- [ ] Turn airplane mode on and off a few times while tapping through a trip. No tap is lost, none is sent twice (check the laptop for duplicate deliveries or batches).
- [ ] Walk somewhere with one bar of signal and send a report with a photo. It either sends or is saved and sends later. It must not show an error and lose the text.

## 7. Phone behaviour

- [ ] Add each page to the **Home Screen** and repeat section 2 from the icon.
- [ ] Save a report offline, lock the phone for 10 minutes, unlock, turn signal on. It sends (may take until the page is in front again).
- [ ] On iPhone: save a report offline, close Safari from the app switcher, reopen the link with signal. The report is still there and sends.

## Pass / fail

The test passes if:
1. Every page opens offline after one visit with signal.
2. No report or tap is lost, and none is saved twice.
3. Times on the laptop are the tap times.
4. Refused taps stay visible until discarded.

Note anything that failed, the phone model and browser, and what you saw.
