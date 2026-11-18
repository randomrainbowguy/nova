
local n = 0
local t
local d

function opponentNoteHit(id, dir, nt, isn)
    if nt == 'Alt Animation' and not isn then
        d = {
            [0] = {rand(-300,-400), rand(-70,70)},
            [1] = {rand(-50,50), rand(200,300)},
            [2] = {rand(-50,50), rand(-200,-300)},
            [3] = {rand(300,400), rand(-70,70)}
        }

        n = n + 1
        t = 'n'..n

        makeLuaSprite(t, 'characters/notes/'..rand(1,4), getProperty('dad.x') + 150, getProperty('dad.y') + 150)
        scaleObject(t, rand(2,2.5), rand(2,2.5))
        addLuaSprite(t, true)
        setProperty(t..'.alpha', 0)

        doTweenX('x'..n, t, getProperty(t..'.x') + d[dir][1], 1.5, 'circOut')
        doTweenY('y'..n, t, getProperty(t..'.y') + d[dir][2], 1.5, 'circOut')
        doTweenAlpha('al'..n, t, 1, 0.5, 'quadOut')
        doTweenAngle('an'..n, t, rand(-50,50), 1, 'circOut')
    end
end

function onTweenCompleted(tt)
    for i = 1,n do
        if tt == 'al'..i then
            doTweenAlpha('al2'..i, 'n'..i, 0, 0.5)
        elseif tt == 'al2'..i then
            removeLuaSprite('n'..i, true)
        end
    end
end

function rand(min, max) return getRandomInt(min, max) end