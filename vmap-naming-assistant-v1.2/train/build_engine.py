"""Inject learned.json into the engine source.
Usage: python3 build_engine.py learned.json ../lib/naming_engine.js   (run inside train/)"""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'naming_engine.src.js'), encoding='utf-8').read()
L = open(sys.argv[1], encoding='utf-8').read()
a = src.index('/*__LEARNED__*/'); b = src.index('/*__END__*/')
open(sys.argv[2], 'w', encoding='utf-8').write(src[:a] + '/*__LEARNED__*/' + L + src[b:])
print('wrote', sys.argv[2])
