function onCreatePost()
makeLuaSprite("Shader1")
setSpriteShader("Shader1", "Glitchy")

makeLuaSprite("Shader2")
setSpriteShader("Shader2", "shift glitch")

makeLuaSprite("Shader3")
setSpriteShader("Shader3", "chrom")

runHaxeCode([[
trace(ShaderFilter);
game.camGame.setFilters([new ShaderFilter(game.getLuaObject("Shader1").shader),new ShaderFilter(game.getLuaObject("Shader2").shader),new ShaderFilter(game.getLuaObject("Shader3").shader)]);

game.camHUD.setFilters([new ShaderFilter(game.getLuaObject("Shader1").shader),new ShaderFilter(game.getLuaObject("Shader2").shader),new ShaderFilter(game.getLuaObject("Shader3").shader)]);
		]])

setShaderFloat("Shader1", "AMT", 0)
setShaderFloat("Shader1", "SPEED", 0)

setShaderFloat("Shader2", "offsetIntensity", 0)
setShaderFloat("Shader2", "noiseQuality",100)

setShaderFloat("Shader3", "amount",0)
end

chrom = 0
function onEvent(n,v1)
if n == 'AddChrom' then
chrom = chrom + v1
end
end

amount = 0
function onUpdatePost()
setShaderFloat("Shader3", "amount",chrom)
end


function boundTo(value, min, max)
return math.max(min, math.min(max, value))
end
function math.lerp(from,to,i)
return from+(to-from)*i
end


function onUpdate(elapsed)
chrom = math.lerp(chrom, 0, boundTo(elapsed * 7, 0, 500));
end