function onCreatePost()

makeLuaSprite('bg', 'stages/bg-greenhill/Sky', -770, -550);
addLuaSprite('bg', false)
scaleObject('bg', 2.6, 2.6)
setScrollFactor('bg', 0, 0)

makeLuaSprite('bg1', 'stages/bg-greenhill/Clouds', -670, -150);
addLuaSprite('bg1', false)
scaleObject('bg1', 2, 2)
setScrollFactor('bg1', 0, 0)

makeLuaSprite('bg2', 'stages/bg-greenhill/Moutians', -750, -150);
addLuaSprite('bg2', false)
scaleObject('bg2', 2.3, 2.3)
setScrollFactor('bg2', 0, 0)

makeLuaSprite('bg3', 'stages/bg-greenhill/Water', -690, 350);
addLuaSprite('bg3', false)
scaleObject('bg3', 2.3, 2.3)
setScrollFactor('bg3', 0, 0)

makeLuaSprite('bg4', 'stages/bg-greenhill/Ground', -870, -150);
addLuaSprite('bg4', false)
scaleObject('bg4', 1.6, 1.6)

makeLuaSprite('bg5', 'stages/bg-greenhill/Foreground', -970, 100);
addLuaSprite('bg5', true)
scaleObject('bg5', 3, 3)

makeAnimatedLuaSprite('ring1','stages/bg-greenhill/rings', -450, 250)
addAnimationByPrefix('ring1','idle ring','idle ring',12,true)
scaleObject('ring1', 1, 1)
addLuaSprite('ring1', true)
end

function onEvent(n, v1, v2)
	if n == 'hi' then
setProperty('dad.visible', false);
  end
 end