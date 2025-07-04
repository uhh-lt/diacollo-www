#!/usr/bin/perl -w

use lib qw(. ./ddc-perl ./DDC-perl);
use DDC::Concordance;
use Encode qw(encode decode);
#use Getopt::Long qw(:config no_ignore_case);
use File::Basename qw(basename dirname);
use CGI qw(:standard :cgi-lib);

use strict;

##======================================================================
## Constants & Globals

our $prog = basename($0);
our $progdir = dirname($0);
(our $rcfile = "$progdir/$prog") =~ s/\.perl$/.rc/i;

##-- BEGIN dstar config
our %dstar = (server_host=>'127.0.0.1', server_port=>'52000', corpus=>'corpus');
if (-r "$progdir/dstar.rc") {
  do "$progdir/dstar.rc" or die("$prog: failed to load '$progdir/dstar.rc': $@");
}
if (-r "$progdir/local.rc") {
  do "$progdir/local.rc" or die("$prog: failed to load '$progdir/local.rc': $@");
}
##-- END dstar config

## $cfg: site configuration & defaults (loaded from $rcfile if available)
our $cfg =
  {
   ##-- user options
   server   => "$dstar{server_host}:$dstar{server_port}", ##-- ddc server
   mode     => 'json',            ##-- ddc query mode (json,html,table,text,req)
   corpus   => '',
   start    => 1,
   limit    => 0,
   hint     => '',

   ##-- client options
   timeout  => 300,
   encoding=>'utf8',
   parseMeta=>1,
   parseContext=>1,
   keepRaw=>0,
   fieldNames=>undef,
   fieldSeparator=>"\x{1f}",
   tokenSeparator=>"\x{1e}",
   dropFields => [],
   expandFields => 1,
   kwic => 1
  };

## @defaults: user-level keys in $cfg with a default value
our @defaults = qw(server corpus mode start limit);

##======================================================================
## Subs: Configuration

## \%cfg = loadConfig($jsonFile)
## \%cfg = loadConfig($jsonFile,\%cfg)
sub loadConfig {
  my ($rcfile,$cfg)=@_;

  open(RC,"<$rcfile") or die("$prog: open failed for config file '$rcfile': $!");
  local $/=undef;
  my $rcstr = <RC>;
  close(RC) or die("$prog: close failed for config file '$rcfile': $!");

  ##-- remove comments
  $rcstr =~ s/^\#.*$//mg;

  ##-- decode
  my $rcdata = decode_json($rcstr)
    or die("$prog: could not decode config data from '$rcfile': $!");

  ##-- merge (clobber)
  %$cfg = (%$cfg,%$rcdata);

  return $cfg;
}



##======================================================================
## MAIN

##-- site configuration
$cfg = loadConfig($rcfile,$cfg) if (-r $rcfile);

##-- CGI init
charset($cfg->{encoding}); ##-- initialize CGI charset
my $vars = {};
if (param()) {
  $vars = Vars();
}

my ($dclient,$content);
eval {
  ##-- get query
  my $query = $vars->{'q'};
  die("$prog: no 'q' (query) parameter specified!") if (($query//'') eq '');
  $query  = decode($cfg->{encoding},$query) if (defined($cfg->{qencoding}));

  ##-- defaults
  $vars->{$_} = $cfg->{$_} foreach (grep {!exists($vars->{$_})} @defaults);

  ##-- create client
  my $server = $vars->{server}
    or die("$prog: no 'server' (ddc server) parameter defined!");
  $dclient = DDC::Client::Distributed->new(%$cfg,
					   connect=>{PeerAddr=>$server},
					   mode=>$vars->{mode},
					   start=>($vars->{start} > 0 ? ($vars->{start}-1) : 0),
					   limit=>25,
					   ($dstar{ignore_user_hints} ? qw() : (hint=>$vars->{hint})),
					  )
    or die("$prog: could not create DDC::Client::Distributed: $!");
  $dclient->open()
    or die("$prog: could not connect to DDC server at $server: $!");

  ##-- append subcorpus clause to query if requested
  my @corpora = grep {defined($_) && $_ ne ''} split(/[\s\,\:\+]+/,$vars->{corpus});
  $query .= ' :'.join(',',@corpora) if (@corpora);

  ##-- send query
  $content = $dclient->queryRaw($query)
    or die("$prog: query ($query) failed: $!");
};

##-- check for errors
my $status = 200;
if ($@) {
  my $msg = $@;
  print
    (header(-status=>500),
     start_html('Error'),
     h1('Error'),"\n",
     pre(escapeHTML($msg)),
     end_html);
  exit 1;
}
elsif ($vars->{q} =~ /^(v?status|info)\b/i && $content =~ /"error"\s*:/s) {
  ##-- tweak HTTP response status for 'status' and 'info' requests
  $status = 500;
}

##-- dump content
my %mode_opts =
  (
   html => {type=>'text/html'},
   text => {type=>'text/plain',headers=>{'-Content-Disposition'=>"inline; filename=\"ddc.txt\""}},
   table  => {type=>'text/plain',headers=>{'-Content-Disposition'=>"inline; filename=\"ddc.tab\""}},
   json => {type=>'application/json',headers=>{'-Content-Disposition'=>"inline; filename=\"ddc.json\""}},
  );
my $modeh = $mode_opts{$dclient->{mode}};
if ($vars->{raw} || $vars->{debug} || $dclient->{mode} eq 'req') {
  delete $modeh->{headers}{'-Content-Disposition'};
  $modeh->{type} = 'text/plain';
}

print
  header(-status => $status,
	 ($vars->{debug} || $vars->{raw}
	  ? (-type=>'text/plain')
	  : (-type=>$modeh->{type},%{$modeh->{headers}||{}})),
	),
  $content;
