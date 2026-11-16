# gas dynamics prototype

node-only exploration, never loaded by the page. run: `node gas/compare.js`

## why diffusion equalizes pressure slowly

the main sim is Fickian diffusion: flux is proportional to the concentration
gradient, there is no pressure variable, no momentum and no waves. bulk
equilibration scales as t ~ L^2/D, and the explicit scheme carries information
at most one cell per round. for L=64 at the fastest rate (1020) a line source
needs 6955 steps to reach 250 everywhere (compare.js). this is not a bug in the
implementation, it is the physics of diffusion: it cannot do better.

## what the lattice Boltzmann prototype does instead

`lbm.js` is a D2Q9 lattice Boltzmann gas with three species sharing one
velocity field. pressure is p = c_s^2 * rho with c_s = 1/sqrt(3), so pressure
travels as compression waves at sound speed instead of creeping as a gradient.
equilibration scales as t ~ L/c_s. measured: total density reaches 98% of the
source in 674 steps, about 10x fewer steps than diffusion, and about 6x faster
in wall time (5.0 ms/step vs 2.9 ms/step, 3.4 s vs 19.9 s total).

## the catch for this game

color is species density, and species ride the flow by advection. once pressure
equalizes the flow decays and species crawl: after 5000 steps the far-field
species minimum is still 0.83, never uniform. diffusion uniformizes color in
6955 steps because concentration is the color. so the gas prototype wins
pressure but loses color spread unless sources are rethought as momentum or
pressure injectors that keep the flow alive. verdict: the current approach is
not wrong-implemented, it is the right tool for color and the wrong tool for
fast pressure; lattice Boltzmann is the reverse.
